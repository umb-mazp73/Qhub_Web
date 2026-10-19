import {
  conflictFailure, forbiddenFailure, notFoundFailure, networkFailure, rateLimitedFailure, serverFailure, unauthorizedFailure,
  badRequestFailure, unknownFailure, validationFailure, isFailure, type Failure,
} from './failures';

/** Traduce errores de Supabase (auth, PostgREST, Edge Functions) a `Failure`: la UI nunca ve errores de Supabase. */
export function failureFromSupabase(e: unknown): Failure {
  if (isFailure(e)) return e;
  const x = e as { message?: string; code?: string; status?: number; name?: string } | null;
  const m = (x?.message ?? '').toLowerCase();
  if (x?.name === 'AuthApiError' || x?.name === 'AuthError' || (x?.name ?? '').startsWith('Auth')) {
    // El disparador de la base (equipo gestionado) bloquea el cambio y Auth lo reporta como error al actualizar el usuario.
    if (m.includes('database error updating user') || m.includes('aprobación de tu administrador') || m.includes('gestiona tu administrador')) return forbiddenFailure('Esto necesita la aprobación de tu administrador. Envíale una solicitud desde Mi perfil.');
    if (m.includes('invalid login') || m.includes('invalid credentials')) return unauthorizedFailure('Correo o contraseña incorrectos.');
    if (m.includes('already registered') || m.includes('already been registered')) return conflictFailure('Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.');
    if (m.includes('email not confirmed')) return badRequestFailure('Confirma tu correo antes de entrar. Revisa tu bandeja.');
    if (m.includes('totp') || m.includes('mfa') && m.includes('code')) return validationFailure('El código no es correcto o ya venció. Prueba con el siguiente.');
    if (m.includes('different from the old')) return validationFailure('La contraseña nueva debe ser distinta de la actual.');
    if (m.includes('reauthentication') || m.includes('recent login')) return unauthorizedFailure('Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.');
    if (m.includes('password')) return validationFailure('La contraseña no cumple los requisitos. Usa al menos 8 caracteres, con letras y números.');
    if (x?.status === 429 || m.includes('rate')) return rateLimitedFailure();
    return badRequestFailure('No pudimos completar la acción. Inténtalo de nuevo en un momento.');   // texto crudo de la librería: nunca a pantalla
  }
  switch (x?.code) {
    case '42501': return forbiddenFailure();
    case '23505': return conflictFailure('Ya existe un registro con esos datos.');
    case 'P0002': return notFoundFailure(x.message);   // mensajes propios de nuestras funciones; si no pasan el filtro, genérico
    case '28000': return unauthorizedFailure();
    case '23514': case '22023': return validationFailure(x.message ?? 'Revisa los datos ingresados.');   // reglas propias; las restricciones técnicas se filtran
  }
  if (m.includes('fetch') || m.includes('network') || x?.name === 'TypeError') return networkFailure();
  return x?.code ? serverFailure() : unknownFailure();
}
