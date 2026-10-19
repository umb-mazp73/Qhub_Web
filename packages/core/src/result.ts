import { Failure } from './failures';

/** Resultado de una operación: éxito o Failure. Sin excepciones en el dominio. */
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: Failure };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(failure: Failure): Result<T> => ({ ok: false, failure });

export function mapResult<T, R>(r: Result<T>, f: (v: T) => R): Result<R> {
  return r.ok ? ok(f(r.value)) : r;
}

/** Devuelve el valor o lanza el Failure (para capas de presentación que ya capturan, p. ej. TanStack Query). */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  throw r.failure;
}

/** Ejecuta `body` y convierte lo que lance en Failure. */
export async function guard<T>(body: () => Promise<T>, map: (e: unknown) => Failure): Promise<Result<T>> {
  try {
    return ok(await body());
  } catch (e) {
    return err(map(e));
  }
}
