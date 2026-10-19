import type { SupabaseClient } from '@supabase/supabase-js';
import {
  badRequestFailure, conflictFailure, err, forbiddenFailure, networkFailure, notFoundFailure, ok, serverFailure, unauthorizedFailure,
  type Failure, type Result,
} from '@qhub/core';

/** Traduce la respuesta de error de una Edge Function a un `Failure`. `msg` es el texto en español que mandó la función. */
export type FunctionErrorMap = (status: number, msg: string | undefined, errorName: string) => Failure;

export const defaultFunctionError: FunctionErrorMap = (status, msg, name) => {
  switch (status) {
    case 400: return badRequestFailure(msg ?? 'Revisa los datos.');
    case 401: return unauthorizedFailure();
    case 403: return forbiddenFailure(msg);
    case 404: return notFoundFailure(msg);
    case 409: return conflictFailure(msg ?? 'Eso ya existe.');
    case 429: return badRequestFailure('Hay demasiados envíos seguidos. Espera unos minutos e inténtalo de nuevo.');
    default: return name === 'FunctionsFetchError' ? networkFailure() : serverFailure();
  }
};

/** Llama a una Edge Function como la persona con sesión. La UI nunca ve el error crudo. */
export async function invokeFunction<T>(sb: SupabaseClient, fn: string, body: Record<string, unknown>, map: FunctionErrorMap = defaultFunctionError): Promise<Result<T>> {
  try {
    const { data, error } = await sb.functions.invoke(fn, { body });
    if (!error) return ok(data as T);
    const ctx = (error as { context?: Response }).context;
    let msg: string | undefined; let status = 500;
    if (ctx && typeof ctx.json === 'function') { status = ctx.status; try { msg = ((await ctx.json()) as { error?: string }).error; } catch { /* sin cuerpo */ } }
    return err(map(status, msg, (error as Error).name));
  } catch { return err(networkFailure()); }
}
