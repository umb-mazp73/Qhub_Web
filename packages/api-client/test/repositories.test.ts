import { describe, expect, it, vi } from 'vitest';
import { ApiContext, AuthRepositoryImpl, FetchTransport, HealthRepositoryImpl, NotificationRepositoryImpl, QueueRepositoryImpl, TicketRepositoryImpl, type RegisterInput } from '../src';
import { FakeTransport, queueJson, scheduleJson, ticketJson } from './helpers';

const failure = (r: { ok: boolean }) => (r as unknown as { failure: { kind: string; message: string; fields: Record<string, string> } }).failure;
const value = <T>(r: { ok: boolean }) => (r as unknown as { value: T }).value;

describe('auth', () => {
  it('login devuelve el token con su vencimiento', async () => {
    const t = new FakeTransport().on('POST /auth/token', { access_token: 'abc', token_type: 'bearer', expires_in: 3600 });
    const r = await new AuthRepositoryImpl(t, { now: () => new Date('2026-01-01T00:00:00Z') }).login('ana', 'x');
    expect(value<{ accessToken: string }>(r).accessToken).toBe('abc');
    expect(t.last.body).toEqual({ identificador: 'ana', password: 'x' });
  });
  it('registro serializa al contrato de la API', async () => {
    const t = new FakeTransport().on('POST /auth/registro', {
      propietario_tipo: 'empresa', propietario_id: 'o1', nombre_usuario: 'ana', email: 'a@b.c', nombre_empresa: 'Clínica', limite_colas: 6, creada_en: '2026-10-17T10:00:00Z',
    }, 201);
    const input: RegisterInput = { accountType: 'empresa', companyName: 'Clínica', firstName: 'Ana', lastName: 'Gómez', username: 'ana', email: 'a@b.c', password: '12345678', country: 'Ecuador', city: 'Quito', acceptedTerms: true };
    const r = await new AuthRepositoryImpl(t).register(input);
    expect(value<{ queueLimit: number }>(r).queueLimit).toBe(6);
    expect(t.last.body).toMatchObject({ tipo_cuenta: 'empresa', acepto_terminos: true, nombre_empresa: 'Clínica' });
  });
});

describe('errores', () => {
  const cases: Array<[number, string]> = [[400, 'bad_request'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [422, 'validation'], [429, 'rate_limited'], [500, 'server'], [503, 'server']];
  it.each(cases)('HTTP %i → %s', async (status, kind) => {
    const t = new FakeTransport().on('GET /colas', { detail: 'x' }, status);
    expect(failure(await new QueueRepositoryImpl(t).list()).kind).toBe(kind);
  });
  it('422 de FastAPI: el texto técnico (inglés, nombres internos de campo) nunca llega a la persona', async () => {
    const t = new FakeTransport().on('POST /colas', { detail: [{ loc: ['body', 'nombre'], msg: 'String should have at least 1 character' }] }, 422);
    const f = failure(await new QueueRepositoryImpl(t).create({ name: 'x' }));
    expect(f.message).toBe('Revisa los datos ingresados.');
    expect(f.fields).toEqual({});
    const g = failure(await new QueueRepositoryImpl(new FakeTransport().on('POST /colas', { detail: [{ loc: ['body', 'nombre'], msg: 'Escribe el nombre de la cola.' }] }, 422)).create({ name: 'x' }));
    expect(g.fields.nombre).toBe('Escribe el nombre de la cola.');         // un mensaje humano sí se conserva
  });
  it('403 no revela los roles internos y 5xx nunca muestra el detalle del servidor', async () => {
    const f403 = failure(await new QueueRepositoryImpl(new FakeTransport().on('GET /colas', { detail: 'Requiere uno de estos roles: admin' }, 403)).list());
    expect(f403.message).toBe('No tienes permiso para hacer esto.');
    const f500 = failure(await new QueueRepositoryImpl(new FakeTransport().on('GET /colas', { detail: 'relation "colas" does not exist at db-1.internal' }, 500)).list());
    expect(f500.message).toMatch(/Algo salió mal de nuestro lado/); expect(f500.message).not.toMatch(/relation|internal/);
    const f404 = failure(await new QueueRepositoryImpl(new FakeTransport().on('GET /colas', { detail: 'Traceback (most recent call last): File "/app/x.py"' }, 404)).list());
    expect(f404.message).toBe('No encontramos lo que buscas.');
  });
  it('el mensaje de la API se conserva (409)', async () => {
    const t = new FakeTransport().on('POST /turnos', { detail: 'La franja está llena' }, 409);
    expect(failure(await new TicketRepositoryImpl(t).create('q1', new Date('2026-11-03T15:00:00Z'))).message).toBe('La franja está llena');
  });
});

describe('FetchTransport', () => {
  const resp = (status: number, body: unknown) => ({ status, text: async () => (body == null ? '' : JSON.stringify(body)) }) as Response;

  it('envía Bearer e identidad en endpoints de negocio y no en los públicos', async () => {
    const ctx = new ApiContext(); ctx.token = 'tok'; ctx.actor = { userId: 'admin-1', role: 'admin' };
    const f = vi.fn(async () => resp(200, []));
    const t = new FetchTransport({ baseUrl: 'http://api.test/', context: ctx, fetchImpl: f as unknown as typeof fetch });
    await t.send({ method: 'GET', path: '/colas', query: { activa: true } });
    await t.send({ method: 'POST', path: '/auth/token', body: {} });
    const [url1, init1] = f.mock.calls[0] as unknown as [string, RequestInit];
    const [, init2] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url1).toBe('http://api.test/colas?activa=true');
    expect(init1.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Usuario-Id': 'admin-1', 'X-Usuario-Rol': 'admin' });
    expect((init2.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('un 401 en un endpoint de negocio avisa a la app; en el login no', async () => {
    const ctx = new ApiContext(); let calls = 0; ctx.onUnauthorized = () => { calls++; };
    const t = new FetchTransport({ baseUrl: 'http://api.test', context: ctx, fetchImpl: (async () => resp(401, { detail: 'x' })) as unknown as typeof fetch });
    await t.send({ method: 'GET', path: '/colas' });
    await t.send({ method: 'POST', path: '/auth/token', body: {} });
    expect(calls).toBe(1);
  });
  it('sin conexión → network', async () => {
    const t = new FetchTransport({ baseUrl: 'http://x', context: new ApiContext(), fetchImpl: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    const r = await new QueueRepositoryImpl(t).list();
    expect(failure(r).kind).toBe('network');
  });
});

describe('colas', () => {
  it('lista con filtro y mapea', async () => {
    const t = new FakeTransport().on('GET /colas', [queueJson()]);
    const r = await new QueueRepositoryImpl(t).list({ active: true });
    expect(value<Array<{ name: string }>>(r)[0]!.name).toBe('Caja 1');
    expect(t.last.query).toEqual({ activa: true });
  });
  it('horario: parsea derivados y serializa PUT con segundos', async () => {
    const t = new FakeTransport().on('PUT /colas/q1/horario', scheduleJson());
    const r = await new QueueRepositoryImpl(t).replaceSchedule('q1', { opens: '08:00', closes: '18:00', slotMinutes: 30, days: [1, 2, 3], turnMinutes: 10, stations: 2, maxDaysAhead: 7 });
    expect(value<{ capacityPerSlot: number }>(r).capacityPerSlot).toBe(6);
    expect(t.last.body).toMatchObject({ hora_apertura: '08:00:00', puestos: 2 });
  });
  it('crear con horario no manda zona horaria', async () => {
    const t = new FakeTransport().on('POST /colas', queueJson(), 201);
    await new QueueRepositoryImpl(t).create({ name: ' Caja ', schedule: { opens: '08:00', closes: '17:00', slotMinutes: 30, days: [1], turnMinutes: 10, maxDaysAhead: 1, timeZone: 'UTC' } });
    expect(t.last.body).not.toHaveProperty('zona_horaria');
    expect(t.last.body).toMatchObject({ nombre: 'Caja', hora_apertura: '08:00:00' });
  });
  it('franjas: fecha YYYY-MM-DD local y disponibilidad', async () => {
    const t = new FakeTransport().on('GET /colas/q1/franjas', [{ inicio: '2026-10-20T15:00:00Z', fin: '2026-10-20T15:30:00Z', cupos: 6, ocupados: 5, disponibles: 1 }]);
    const r = await new QueueRepositoryImpl(t).slots('q1', new Date(2026, 9, 20));
    expect(t.last.query).toEqual({ fecha: '2026-10-20' });
    expect(value<Array<{ available: number }>>(r)[0]!.available).toBe(1);
  });
  it('delete (204), límite y estado', async () => {
    const t = new FakeTransport().on('DELETE /colas/q1', null, 204)
      .on('GET /colas/limite', { propietario_tipo: 'empresa', limite: 6, activas: 2, disponibles: 4 })
      .on('GET /colas/q1/estado', { cola_id: 'q1', turnos_en_espera: 3, turnos_atendiendo: 1 });
    const r = new QueueRepositoryImpl(t);
    expect((await r.delete('q1')).ok).toBe(true);
    expect(value<{ available: number }>(await r.limit()).available).toBe(4);
    expect(value<{ waiting: number }>(await r.state('q1')).waiting).toBe(3);
  });
});

describe('turnos', () => {
  it('en vivo no manda franja; programado la manda en UTC', async () => {
    const t = new FakeTransport().on('POST /turnos', ticketJson(), 201);
    const r = new TicketRepositoryImpl(t);
    await r.create('q1');
    expect(t.last.body).toEqual({ cola_id: 'q1' });
    await r.create('q1', new Date('2026-11-03T15:00:00Z'));
    expect(t.last.body).toEqual({ cola_id: 'q1', franja_inicio: '2026-11-03T15:00:00.000Z' });
  });
  it('ciclo de atención', async () => {
    const t = new FakeTransport()
      .on('PATCH /turnos/t1/atender', ticketJson({ estado: 'atendiendo' }))
      .on('PATCH /turnos/t1/finalizar', ticketJson({ estado: 'finalizado' }))
      .on('PATCH /turnos/t1/no-show', ticketJson({ estado: 'no_show' }));
    const r = new TicketRepositoryImpl(t);
    expect(value<{ status: string }>(await r.call('t1')).status).toBe('atendiendo');
    expect(value<{ status: string }>(await r.finish('t1')).status).toBe('finalizado');
    expect(value<{ status: string }>(await r.noShow('t1')).status).toBe('no_show');
  });
  it('listado: filtros y paginación', async () => {
    const t = new FakeTransport().on('GET /turnos', [ticketJson()]);
    await new TicketRepositoryImpl(t).list({ queueId: 'q1', status: 'no_show', date: new Date(2026, 9, 1), limit: 50, offset: 100 });
    expect(t.last.query).toEqual({ cola_id: 'q1', estado: 'no_show', fecha: '2026-10-01', limite: 50, desde: 100 });
  });
});

describe('notificaciones y salud', () => {
  it('lista y marca leída', async () => {
    const n = { id: 'n1', usuario_id: 'cli-1', turno_id: 't1', mensaje: 'Tu turno #4 está siendo atendido', leida: false, creada_en: '2026-10-20T15:01:00Z' };
    const t = new FakeTransport().on('GET /notificaciones', [n]).on('PATCH /notificaciones/n1/leida', { ...n, leida: true });
    const r = new NotificationRepositoryImpl(t);
    expect(value<Array<{ read: boolean }>>(await r.list())[0]!.read).toBe(false);
    expect(value<{ read: boolean }>(await r.markRead('n1')).read).toBe(true);
  });
  it('/listo acepta 503 como respuesta válida', async () => {
    const t = new FakeTransport().on('GET /listo', { supabase: 'caido', rabbitmq: 'ok' }, 503);
    expect(value<{ supabase: string }>(await new HealthRepositoryImpl(t).ready()).supabase).toBe('caido');
  });
});
