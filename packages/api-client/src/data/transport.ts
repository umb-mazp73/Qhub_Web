import {
  badRequestFailure, conflictFailure, forbiddenFailure, networkFailure, notFoundFailure, rateLimitedFailure, serverFailure,
  unauthorizedFailure, unknownFailure, validationFailure, Failure, isFailure,
} from '@qhub/core';
import type { Actor, ActorRole } from '../domain/entities';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export interface HttpRequest {
  method: HttpMethod; path: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown;
  /** Rol con el que se hace ESTA llamada, si difiere del de la sesión (p. ej. un administrador que atiende turnos actúa como agente). */
  actorRole?: ActorRole;
}
export interface HttpResponse { status: number; body: unknown }

/** Puerto de transporte. Solo lanza `Failure('network')` ante problemas de conectividad; los HTTP 4xx/5xx vuelven como respuesta. */
export interface HttpTransport { send(req: HttpRequest): Promise<HttpResponse> }

/** Estado de sesión que lee el transporte. Lo escribe la app (login/logout). */
export class ApiContext {
  token: string | null = null;
  actor: Actor | null = null;
  /** Se invoca ante un 401 en un endpoint de negocio (token vencido: no hay refresh). */
  onUnauthorized: (() => void) | null = null;
  get isAuthenticated() { return !!this.token; }
  clear() { this.token = null; this.actor = null; }
}

const isPublicPath = (p: string) => p.startsWith('/auth/') || p === '/' || p === '/listo';

export interface FetchTransportOptions { baseUrl: string; context: ApiContext; fetchImpl?: typeof fetch; timeoutMs?: number }

/** Transporte HTTP real con los headers de identidad de la API. */
export class FetchTransport implements HttpTransport {
  private readonly base: string;
  private readonly ctx: ApiContext;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(o: FetchTransportOptions) {
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.ctx = o.context;
    this.fetchImpl = o.fetchImpl ?? ((...a) => fetch(...a));
    this.timeoutMs = o.timeoutMs ?? 20_000;
  }

  async send(req: HttpRequest): Promise<HttpResponse> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const url = `${this.base}${req.path}${qs.size ? `?${qs}` : ''}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (req.body !== undefined) headers['Content-Type'] = 'application/json';
    if (!isPublicPath(req.path)) {
      if (this.ctx.token) headers.Authorization = `Bearer ${this.ctx.token}`;
      if (this.ctx.actor) { headers['X-Usuario-Id'] = this.ctx.actor.userId; headers['X-Usuario-Rol'] = req.actorRole ?? this.ctx.actor.role; }
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, { method: req.method, headers, body: req.body === undefined ? undefined : JSON.stringify(req.body), signal: ac.signal });
      const text = await res.text();
      let body: unknown = null;
      if (text) { try { body = JSON.parse(text); } catch { body = null; } }
      if (res.status === 401 && !isPublicPath(req.path)) this.ctx.onUnauthorized?.();
      return { status: res.status, body };
    } catch (e) {
      if (isFailure(e)) throw e;
      throw networkFailure();
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseDetail(body: unknown): { message: string | null; fields: Record<string, string> } {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return { message: detail, fields: {} };
  if (Array.isArray(detail)) {
    // Errores de validación del servidor (texto técnico, a menudo en inglés y con nombres internos de campos): no se muestran.
    // `Failure` descarta de todos modos lo que no sea un mensaje humano; aquí solo se conservan los campos con texto seguro.
    const fields: Record<string, string> = {};
    for (const item of detail) {
      if (item && typeof item === 'object') {
        const loc = (item as { loc?: unknown }).loc;
        const field = Array.isArray(loc) && loc.length > 0 ? String(loc[loc.length - 1]) : '';
        const msg = (item as { msg?: unknown }).msg;
        if (field && field !== 'body' && typeof msg === 'string') fields[field] = msg;
      }
    }
    return { message: null, fields };
  }
  const nested = (detail as { message?: unknown } | undefined)?.message;
  if (typeof nested === 'string') return { message: nested, fields: {} };
  return { message: null, fields: {} };
}

/** Traduce un status HTTP no exitoso a un Failure del dominio. */
export function failureFromResponse(status: number, body: unknown): Failure {
  const { message, fields } = parseDetail(body);
  switch (true) {
    case status === 400: return badRequestFailure(message ?? 'La solicitud no es válida.');
    case status === 401: return unauthorizedFailure(message ?? undefined);
    case status === 403: return forbiddenFailure();      // el detalle revelaría los roles internos de la API
    case status === 404: return notFoundFailure(message ?? undefined);
    case status === 409: return conflictFailure(message ?? 'Esa acción choca con el estado actual.');
    case status === 422: return validationFailure(message ?? 'Revisa los datos ingresados.', fields);
    case status === 429: return rateLimitedFailure();
    case status >= 500: return serverFailure();
    default: return unknownFailure(message ?? undefined);
  }
}

export const mapError = (e: unknown): Failure => (isFailure(e) ? e : unknownFailure());

/** Llama y devuelve el cuerpo si fue 2xx; si no, lanza el Failure. Para usar dentro de `guard`. */
export async function call(t: HttpTransport, req: HttpRequest, accept: readonly number[] = [200, 201, 204]): Promise<unknown> {
  const res = await t.send(req);
  if (!accept.includes(res.status)) throw failureFromResponse(res.status, res.body);
  return res.body;
}
