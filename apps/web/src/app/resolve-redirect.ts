import { routeAllowed, type OrgRole } from '@/features/staff';

/** A dónde va el usuario según su estado. Pura y testeable. `null` = se queda donde está (también mientras carga). */
export function resolveRedirect(o: {
  location: string; authLoading: boolean; signedIn: boolean; membershipsLoading: boolean; hasOrganization: boolean; role: OrgRole | null; connected: boolean; mfa?: 'checking' | 'ok' | 'required';
  /** No se pudieron cargar las organizaciones (error de red/permiso), distinto de "no tiene ninguna". */
  membershipsError?: boolean;
  /** Hay una invitación por aceptar (llegó por el botón del correo). */
  pendingInvitation?: boolean;
}): string | null {
  const here = o.location;
  // Se normaliza el query string: el enlace del correo es /qhub/restablecer?token=... y el
  // registro de otra cuenta abre /connect?tab=crear. Las comparaciones de ruta usan `path`.
  const path = here.split('?')[0] ?? here;
  // «Registrarse en Qhub» abre /connect?tab=crear a propósito, incluso si la organización ya
  // está conectada (es registrar OTRA cuenta). En ese caso /connect NO es una ruta de entrada
  // que deba rebotar a /inicio.
  const registering = path === '/connect' && here.includes('tab=crear');
  const entry = ['/login', '/setup', '/cargando', '/', '/verificacion', ...(registering ? [] : ['/connect'])];
  // Fix #3 (HIGH): el destinatario del correo de reset de Qhub llega ANÓNIMO. Estas rutas
  // son públicas y el chequeo va ANTES del guardado !signedIn (que si no, lo expulsa a /login).
  if (path === '/qhub/recuperar' || path === '/qhub/restablecer') return null;
  if (path === '/confirmar') return null;                            // el botón del correo de registro: llega sin sesión y crea las cuentas
  if (o.authLoading || (o.signedIn && o.mfa === 'checking')) return null;
  if (!o.signedIn) return path === '/login' ? null : '/login';
  if (o.mfa === 'required') return path === '/verificacion' ? null : '/verificacion';
  if (o.membershipsLoading) return null;
  // Si NO se pudieron cargar las organizaciones (error de red/permiso, no "cero organizaciones"),
  // no mandamos a /setup como si no tuviera ninguna: se queda donde está para reintentar/avisar.
  if (o.membershipsError) return null;
  if (path === '/verificacion') return '/inicio';
  if (path === '/invitacion') return null;                           // se acepta con o sin organización, y antes de conectar con Qhub
  if (o.pendingInvitation && (entry.includes(path) || !o.hasOrganization)) return '/invitacion';
  if (path === '/restablecer' || path === '/perfil') return o.hasOrganization || path === '/restablecer' ? null : '/setup';
  if (!o.hasOrganization) return path === '/setup' ? null : '/setup';
  if (registering) return null;                                      // ya con sesión, organización y MFA ok: deja ver el registro de otra cuenta
  if (!o.connected) return path === '/connect' ? null : '/connect';
  if (entry.includes(path)) return '/inicio';
  if (!routeAllowed(o.role, path)) return '/inicio';
  return null;
}
