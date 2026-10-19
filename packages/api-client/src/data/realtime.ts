import { unauthorizedFailure } from '@qhub/core';
import type { AppNotification, ConnectionStatus } from '../domain/entities';
import type { QueueSubscription, RealtimeRepository } from '../domain/repositories';
import { queueEventFromJson, notificationEventFromJson } from './mappers';
import type { ApiContext } from './transport';

/** Subconjunto de WebSocket que usamos (el del navegador y el de React Native lo cumplen). */
export interface WebSocketLike {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  close(code?: number): void;
}
export type WebSocketFactory = (url: string) => WebSocketLike;

export interface RealtimeOptions {
  wsBaseUrl: string; context: ApiContext; factory?: WebSocketFactory; backoffMs?: (attempt: number) => number;
  setTimeoutImpl?: (fn: () => void, ms: number) => unknown; clearTimeoutImpl?: (h: unknown) => void;
}

const defaultBackoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));

/** WebSocket con reconexión exponencial. Cierre 4401 = token inválido o cola ajena: no reintenta. */
export class RealtimeRepositoryImpl implements RealtimeRepository {
  private readonly base: string;
  private readonly factory: WebSocketFactory;
  private readonly backoff: (n: number) => number;
  private readonly st: (fn: () => void, ms: number) => unknown;
  private readonly ct: (h: unknown) => void;

  constructor(private readonly o: RealtimeOptions) {
    this.base = o.wsBaseUrl.replace(/\/+$/, '');
    this.factory = o.factory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this.backoff = o.backoffMs ?? defaultBackoff;
    this.st = o.setTimeoutImpl ?? ((fn, ms) => setTimeout(fn, ms));
    this.ct = o.clearTimeoutImpl ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  private url(path: string): string {
    const { token, actor } = this.o.context;
    if (!token || !actor) throw unauthorizedFailure();
    return `${this.base}${path}?token=${encodeURIComponent(`${token}:${actor.userId}:${actor.role}`)}`;
  }

  private open(path: string, onJson: (j: Record<string, unknown>) => void, onError: ((e: Error) => void) | undefined, onStatus: ((s: ConnectionStatus) => void) | undefined): () => void {
    let cancelled = false;
    let attempts = 0;
    let socket: WebSocketLike | null = null;
    let timer: unknown = null;

    const schedule = () => {
      if (cancelled) return;
      onStatus?.('reconnecting');
      attempts++;
      timer = this.st(connect, this.backoff(attempts));
    };

    const connect = () => {
      if (cancelled) return;
      onStatus?.(attempts === 0 ? 'connecting' : 'reconnecting');
      let s: WebSocketLike;
      try {
        s = this.factory(this.url(path));
      } catch (e) {
        cancelled = true;
        onError?.(e as Error);
        return;
      }
      socket = s;
      s.onopen = () => { attempts = 0; onStatus?.('connected'); };
      s.onmessage = (ev) => {
        try { const j = JSON.parse(String(ev.data)); if (j && typeof j === 'object') onJson(j as Record<string, unknown>); } catch { /* mensaje ajeno al contrato */ }
      };
      s.onerror = () => { /* el cierre se maneja en onclose */ };
      s.onclose = (ev) => {
        if (cancelled) return;
        if (ev.code === 4401) {
          cancelled = true;
          onError?.(unauthorizedFailure());
          this.o.context.onUnauthorized?.();
          return;
        }
        schedule();
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (timer != null) this.ct(timer);
      const s = socket; socket = null;
      try { s?.close(); } catch { /* ya cerrado */ }
      onStatus?.('closed');
    };
  }

  subscribeQueue(queueId: string, sub: QueueSubscription): () => void {
    return this.open(`/ws/turnos/${queueId}`, (j) => { const e = queueEventFromJson(j); if (e) sub.onEvent(e); }, sub.onError, sub.onStatus);
  }

  subscribeNotifications(sub: { onNotification(n: AppNotification): void; onError?(e: Error): void; onStatus?(s: ConnectionStatus): void }): () => void {
    return this.open('/ws/notificaciones', (j) => { const n = notificationEventFromJson(j); if (n) sub.onNotification(n); }, sub.onError, sub.onStatus);
  }
}
