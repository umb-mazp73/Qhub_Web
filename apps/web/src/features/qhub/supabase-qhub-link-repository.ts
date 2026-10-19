import type { SupabaseClient } from '@supabase/supabase-js';
import {
  badRequestFailure, err, forbiddenFailure, networkFailure, notFoundFailure, ok, serverFailure, unauthorizedFailure,
  type Failure, type Result,
} from '@qhub/core';
import type { AuthToken } from '@qhub/api-client';
import type { QhubLinkRepository } from './link';
import { invokeFunction } from '@/shared/invoke-function';

type Body = Record<string, unknown>;

/** Habla con las Edge Functions `qhub-link` y `qhub-token`. Traduce sus respuestas a `Failure`. */
export class SupabaseQhubLinkRepository implements QhubLinkRepository {
  constructor(private readonly sb: SupabaseClient) {}

  private call<T>(fn: string, body: Body): Promise<Result<T>> { return invokeFunction<T>(this.sb, fn, body, (st, msg, name) => this.fail(st, msg, name)); }

  private fail(status: number, msg: string | undefined, name: string): Failure {
    switch (status) {
      case 400: return badRequestFailure(msg ?? 'Revisa los datos.');
      case 401: return unauthorizedFailure();
      case 403: return forbiddenFailure(msg);
      case 404: return notFoundFailure('Esta cuenta todavía no está conectada con Qhub.');
      case 409: return unauthorizedFailure('La contraseña de Qhub que teníamos guardada ya no es válida. Conecta tu cuenta de nuevo.');
      case 503: return badRequestFailure(msg ?? 'El servicio todavía no está disponible.');
      default: return name === 'FunctionsFetchError' ? networkFailure() : serverFailure();
    }
  }

  async issueToken(orgId: string): Promise<Result<AuthToken>> {
    const r = await this.call<{ access_token?: string; expires_in?: number }>('qhub-token', { organizacion_id: orgId });
    if (!r.ok) return r;
    if (!r.value?.access_token) return err(serverFailure());
    return ok({ accessToken: r.value.access_token, expiresIn: Number(r.value.expires_in ?? 3600), issuedAt: new Date() });
  }
  private async act(body: Body): Promise<Result<void>> { const r = await this.call<unknown>('qhub-link', body); return r.ok ? ok(undefined) : r; }
  connect(orgId: string, identifier: string, password: string) { return this.act({ organizacion_id: orgId, accion: 'conectar', identificador: identifier.trim(), password }); }
  publish(orgId: string) { return this.act({ organizacion_id: orgId, accion: 'publicar' }); }
  unpublish(orgId: string) { return this.act({ organizacion_id: orgId, accion: 'despublicar' }); }
  disconnect(orgId: string) { return this.act({ organizacion_id: orgId, accion: 'desvincular' }); }
}
