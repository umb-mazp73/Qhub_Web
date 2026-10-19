import { describe, expect, it } from 'vitest';
import { ApiContext, AuthRepositoryImpl, FetchTransport, HealthRepositoryImpl, QueueRepositoryImpl, RealtimeRepositoryImpl, TICKET_STATUSES, isReady, type WebSocketLike } from '../../src';

/** Contra la API REAL en un contenedor (sin Supabase ni RabbitMQ): contrato HTTP/WS, errores y OpenAPI. */
const base = process.env.QHUB_API_URL;
const d = base ? describe : describe.skip;

d('contrato contra la API real', () => {
  const ctx = new ApiContext(); ctx.token = 'no-es-un-token'; ctx.actor = { userId: 'u1', role: 'admin' };
  let unauthorized = 0; ctx.onUnauthorized = () => { unauthorized++; };
  const transport = new FetchTransport({ baseUrl: base ?? '', context: ctx });

  it('/listo se entiende siempre: degradada (sin credenciales) o sana (API real)', async () => {
    const r = await new HealthRepositoryImpl(transport).ready();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.value.supabase).toBe('string'); expect(typeof r.value.rabbitmq).toBe('string');
    expect(isReady(r.value)).toBe(r.value.supabase === 'ok' && r.value.rabbitmq === 'ok');   // coherente con lo que informa
  });
  it('token inválido → 401 unauthorized y se avisa a la app', async () => {
    const r = await new QueueRepositoryImpl(transport).list();
    expect(!r.ok && r.failure.kind).toBe('unauthorized');
    expect(unauthorized).toBeGreaterThan(0);
  });
  it('registro incompleto → 422 de validación, sin texto técnico del servidor (en inglés ni nombres de campo)', async () => {
    const r = await new AuthRepositoryImpl(transport).register({ accountType: 'empresa', firstName: 'A', lastName: 'B', username: 'ab', email: 'no-es-correo', password: 'corta', country: 'Ecuador', city: 'Quito', acceptedTerms: true });
    expect(!r.ok && r.failure.kind).toBe('validation');
    if (r.ok) return;
    expect(r.failure.message).toBe('Revisa los datos ingresados.');
    expect(JSON.stringify(r.failure)).not.toMatch(/nombre_usuario|should|String|valid email/i);
  });
  it('los términos son obligatorios', async () => {
    const r = await new AuthRepositoryImpl(transport).register({ accountType: 'usuario', firstName: 'Ana', lastName: 'Gómez', username: 'anagomez', email: 'ana@x.com', password: 'clave-segura-1', country: 'Ecuador', city: 'Quito', acceptedTerms: false });
    expect(!r.ok && r.failure.kind).toBe('validation');
  });
  it('WebSocket con token inválido cierra con 4401 → unauthorized', async () => {
    const { WebSocket: WS } = await import('ws').catch(() => ({ WebSocket: undefined as never }));
    const factory = (url: string): WebSocketLike => {
      const s = new WS(url);
      const w: WebSocketLike = { onopen: null, onmessage: null, onclose: null, onerror: null, close: () => s.close() };
      s.on('open', () => w.onopen?.({})); s.on('message', (data: unknown) => w.onmessage?.({ data: String(data) }));
      s.on('close', (code: number) => w.onclose?.({ code })); s.on('error', () => w.onerror?.({}));
      return w;
    };
    const rt = new RealtimeRepositoryImpl({ wsBaseUrl: (base ?? '').replace('http', 'ws'), context: ctx, factory });
    const err = await new Promise<Error>((resolve) => { const off = rt.subscribeQueue('00000000-0000-4000-8000-000000000000', { onEvent: () => {}, onError: (e) => { off(); resolve(e); } }); });
    expect((err as { kind?: string }).kind).toBe('unauthorized');
  });

  describe('OpenAPI', () => {
    const spec = async () => (await (await fetch(`${base}/openapi.json`)).json()) as { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, { properties?: Record<string, unknown>; enum?: string[] }> } };
    const props = (s: Awaited<ReturnType<typeof spec>>, name: string) => Object.keys(s.components.schemas[name]?.properties ?? {});

    it('todos los endpoints que usa el cliente existen con ese método', async () => {
      const s = await spec();
      const used: Record<string, string> = {
        '/auth/token': 'post', '/auth/registro': 'post', '/colas': 'get', '/colas/limite': 'get', '/colas/{cola_id}': 'get', '/colas/{cola_id}/horario': 'put',
        '/colas/{cola_id}/franjas': 'get', '/colas/{cola_id}/estado': 'get', '/turnos': 'post', '/turnos/mios': 'get', '/turnos/{turno_id}': 'get',
        '/turnos/{turno_id}/posponer': 'patch', '/turnos/{turno_id}/cancelar': 'patch', '/turnos/{turno_id}/atender': 'patch', '/turnos/{turno_id}/finalizar': 'patch',
        '/turnos/{turno_id}/no-show': 'patch', '/notificaciones': 'get', '/notificaciones/{notificacion_id}/leida': 'patch', '/notificaciones/{notificacion_id}': 'delete', '/listo': 'get',
      };
      for (const [path, method] of Object.entries(used)) expect(Object.keys(s.paths[path] ?? {}), `${method} ${path}`).toContain(method);
    });
    it('los campos que el cliente lee y envía existen', async () => {
      const s = await spec();
      expect(props(s, 'TurnoOut')).toEqual(expect.arrayContaining(['id', 'cola_id', 'propietario_nombre', 'usuario_id', 'franja_inicio', 'programado', 'numero', 'estado', 'posicion', 'hora_creacion', 'hora_atencion', 'hora_finalizacion', 'agente_id']));
      expect(props(s, 'ColaOut')).toEqual(expect.arrayContaining(['id', 'propietario_nombre', 'nombre', 'descripcion', 'activa']));
      expect(props(s, 'HorarioOut')).toEqual(expect.arrayContaining(['cola_id', 'zona_horaria', 'hora_apertura', 'hora_cierre', 'duracion_franja_minutos', 'dias_atencion', 'duracion_turno_minutos', 'puestos', 'capacidad_diaria', 'dias_anticipacion_maxima', 'franjas_por_dia', 'cupos_por_franja', 'turnos_por_dia']));
      expect(props(s, 'FranjaOut')).toEqual(expect.arrayContaining(['inicio', 'fin', 'cupos', 'ocupados', 'disponibles']));
      expect(props(s, 'NotificacionOut')).toEqual(expect.arrayContaining(['id', 'usuario_id', 'turno_id', 'mensaje', 'leida', 'creada_en']));
      expect(props(s, 'HorarioActualizar')).toEqual(expect.arrayContaining(['hora_apertura', 'hora_cierre', 'duracion_franja_minutos', 'dias_atencion', 'duracion_turno_minutos', 'puestos', 'capacidad_diaria', 'dias_anticipacion_maxima', 'zona_horaria']));
      expect(props(s, 'TurnoCrear')).toEqual(expect.arrayContaining(['cola_id', 'franja_inicio']));
      expect(props(s, 'RegistroCrear')).toEqual(expect.arrayContaining(['tipo_cuenta', 'nombre_empresa', 'nombre', 'apellido', 'nombre_usuario', 'email', 'password', 'pais', 'ciudad', 'acepto_terminos']));
    });
    it('los estados del turno coinciden con el enum de la API', async () => {
      const s = await spec();
      expect([...(s.components.schemas.TurnoEstado?.enum ?? [])].sort()).toEqual([...TICKET_STATUSES].sort());
    });
  });
});
