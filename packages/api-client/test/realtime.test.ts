import { describe, expect, it, vi } from 'vitest';
import { ApiContext, RealtimeRepositoryImpl, type QueueEvent, type WebSocketLike } from '../src';

class FakeSocket implements WebSocketLike {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {}
  close() { this.closed = true; }
  open() { this.onopen?.({}); }
  send(o: object) { this.onmessage?.({ data: JSON.stringify(o) }); }
  drop(code: number) { this.onclose?.({ code }); }
}

function setup() {
  const ctx = new ApiContext(); ctx.token = 'tok'; ctx.actor = { userId: 'u1', role: 'agente' };
  const sockets: FakeSocket[] = [];
  const timers: Array<() => void> = [];
  const rt = new RealtimeRepositoryImpl({
    wsBaseUrl: 'ws://api.test/', context: ctx, backoffMs: () => 5,
    factory: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
    setTimeoutImpl: (fn) => { timers.push(fn); return timers.length; }, clearTimeoutImpl: () => {},
  });
  return { ctx, sockets, timers, rt };
}

describe('realtime', () => {
  it('arma la URL con token:usuario:rol y entrega eventos tipados', () => {
    const { sockets, rt } = setup();
    const events: QueueEvent[] = [];
    rt.subscribeQueue('q1', { onEvent: (e) => events.push(e) });
    const s = sockets[0]!;
    expect(s.url).toBe('ws://api.test/ws/turnos/q1?token=tok%3Au1%3Aagente');
    s.open();
    s.send({ tipo: 'ping' });
    s.send({ tipo: 'turno_llamado', cola_id: 'q1', payload: { id: 't1', numero: 4, estado: 'atendiendo', posicion: 0, usuario_id: 'cli-1' } });
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('turno_llamado');
    expect(events[0]!.ticket?.number).toBe(4);
    expect(events[0]!.ticket?.status).toBe('atendiendo');
  });
  it('reconecta si el servidor cierra', () => {
    const { sockets, timers, rt } = setup();
    const status: string[] = [];
    rt.subscribeQueue('q1', { onEvent: () => {}, onStatus: (s) => status.push(s) });
    sockets[0]!.open();
    sockets[0]!.drop(1006);
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(sockets).toHaveLength(2);
    expect(status).toEqual(['connecting', 'connected', 'reconnecting', 'reconnecting']);
  });
  it('4401 → unauthorized, avisa a la app y no reintenta', () => {
    const { ctx, sockets, timers, rt } = setup();
    const onUnauthorized = vi.fn(); ctx.onUnauthorized = onUnauthorized;
    const onError = vi.fn();
    rt.subscribeQueue('q1', { onEvent: () => {}, onError });
    sockets[0]!.drop(4401);
    expect(onError.mock.calls[0]![0].kind).toBe('unauthorized');
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(timers).toHaveLength(0);
  });
  it('avisos personales', () => {
    const { sockets, rt } = setup();
    const got: string[] = [];
    rt.subscribeNotifications({ onNotification: (n) => got.push(n.kind ?? '') });
    sockets[0]!.send({ tipo: 'conectado', usuario_id: 'u1', no_leidas: 2 });
    sockets[0]!.send({ tipo: 'notificacion', notificacion: { id: 'n1', mensaje: 'Tu turno #4 está siendo atendido', turno_id: 't1', tipo_aviso: 'turno_llamado', leida: false, creada_en: '2026-10-20T15:01:00Z' } });
    expect(got).toEqual(['turno_llamado']);
  });
  it('sin sesión no abre el socket y avisa', () => {
    const { ctx, sockets, rt } = setup();
    ctx.clear();
    const onError = vi.fn();
    rt.subscribeNotifications({ onNotification: () => {}, onError });
    expect(sockets).toHaveLength(0);
    expect(onError.mock.calls[0]![0].kind).toBe('unauthorized');
  });
  it('cancelar la suscripción cierra el socket y no reconecta', () => {
    const { sockets, timers, rt } = setup();
    const off = rt.subscribeQueue('q1', { onEvent: () => {} });
    off();
    expect(sockets[0]!.closed).toBe(true);
    sockets[0]!.drop(1006);
    expect(timers).toHaveLength(0);
  });
});
