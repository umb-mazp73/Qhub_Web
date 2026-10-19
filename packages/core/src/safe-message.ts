/**
 * Mensajes seguros para la persona usuaria. Nada técnico debe llegar a pantalla: nombres de tablas, restricciones, servicios
 * internos, rutas, tokens, trazas, mensajes crudos en inglés ni campos de la API. Lo que no pase este filtro se reemplaza
 * por un mensaje genérico en español.
 */
const TECHNICAL = new RegExp([
  'relation', 'constraint', 'violat', 'column', 'schema', 'syntax', 'permission denied', 'row-level', '\\brls\\b', 'policy',
  'jwt', 'pgrst', 'postgres', 'supabase', 'rabbit', 'amqp', 'redis', 'stack', 'traceback', 'exception', 'undefined', 'null value',
  'duplicate key', '\\bsql\\b', 'uuid', 'bearer', 'access_token', 'secret', 'api[ _-]?key', 'localhost', '127\\.0\\.0\\.1', 'https?:',
  '\\.(tsx?|jsx?|py)\\b', 'econn', 'enotfound', 'etimedout', 'typeerror', 'referenceerror', 'syntaxerror', 'failed to fetch', 'networkerror',
  'internal server', '\\bat \\w+ \\(', '\\btoken\\b', '[a-z]+_[a-z]+', '[{}<>`]',
].join('|'), 'i');
/** Palabras en inglés típicas de mensajes crudos de librerías y servidores (Pydantic, Supabase, navegador). */
const ENGLISH = /\b(should|must|required|field|string|value|input|invalid|missing|expected|failed|unable|cannot|denied|forbidden|unauthorized|not found|already|exceed|too (short|long)|please|try again)\b/i;

export function isSafeMessage(m: unknown): m is string {
  return typeof m === 'string' && m.trim().length > 0 && m.length <= 240 && !m.includes('\n') && !TECHNICAL.test(m) && !ENGLISH.test(m);
}

export const safeMessage = (m: unknown, fallback: string): string => (isSafeMessage(m) ? m.trim() : fallback);

export const GENERIC_ERROR = 'Ocurrió un error inesperado. Inténtalo de nuevo en un momento.';
