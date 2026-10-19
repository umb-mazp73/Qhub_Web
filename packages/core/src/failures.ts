import { GENERIC_ERROR, isSafeMessage, safeMessage } from './safe-message';

/** Errores del dominio. La UI nunca ve errores de fetch ni de Supabase. */
export type FailureKind =
  | 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'bad_request' | 'validation' | 'rate_limited' | 'server' | 'unknown';

/** Mensaje por defecto de cada tipo: es lo que se muestra si el que llegó era técnico o venía de fuera. */
const DEFAULT_MESSAGE: Record<FailureKind, string> = {
  network: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
  unauthorized: 'Tu sesión venció. Inicia sesión de nuevo.',
  forbidden: 'No tienes permiso para hacer esto.',
  not_found: 'No encontramos lo que buscas.',
  conflict: 'Esa acción choca con el estado actual.',
  bad_request: 'La solicitud no es válida. Revisa los datos.',
  validation: 'Revisa los datos ingresados.',
  rate_limited: 'Demasiados intentos. Espera un momento.',
  server: 'Algo salió mal de nuestro lado. Inténtalo en un momento.',
  unknown: GENERIC_ERROR,
};

export class Failure extends Error {
  readonly fields: Readonly<Record<string, string>>;
  /**
   * Punto único por el que pasa todo error que ve la persona: si el mensaje es técnico (o está en inglés, o revela
   * nombres internos) se reemplaza por el mensaje genérico de su tipo. Los mensajes de los campos pasan el mismo filtro.
   */
  constructor(readonly kind: FailureKind, message: string, fields: Readonly<Record<string, string>> = {}) {
    super(safeMessage(message, DEFAULT_MESSAGE[kind]));
    this.name = 'Failure';
    this.fields = Object.fromEntries(Object.entries(fields).filter(([, v]) => isSafeMessage(v)));
  }
}

export const networkFailure = (m = 'No hay conexión. Revisa tu internet e inténtalo de nuevo.') => new Failure('network', m);
export const unauthorizedFailure = (m = 'Tu sesión venció. Inicia sesión de nuevo.') => new Failure('unauthorized', m);
export const forbiddenFailure = (m = 'No tienes permiso para hacer esto.') => new Failure('forbidden', m);
export const notFoundFailure = (m = 'No encontramos lo que buscas.') => new Failure('not_found', m);
export const conflictFailure = (m: string) => new Failure('conflict', m);
export const badRequestFailure = (m: string) => new Failure('bad_request', m);
export const validationFailure = (m: string, fields: Record<string, string> = {}) => new Failure('validation', m, fields);
export const rateLimitedFailure = (m = 'Demasiados intentos. Espera un momento.') => new Failure('rate_limited', m);
export const serverFailure = (m = 'Algo salió mal de nuestro lado. Inténtalo en un momento.') => new Failure('server', m);
export const unknownFailure = (m = 'Ocurrió un error inesperado.') => new Failure('unknown', m);

export const isFailure = (e: unknown): e is Failure => e instanceof Failure;

/** Mensaje para mostrar ante cualquier error capturado: el de un `Failure` (ya filtrado) o uno genérico. Nunca el texto crudo. */
export const friendlyError = (e: unknown, fallback = GENERIC_ERROR): string => (isFailure(e) ? e.message : fallback);
