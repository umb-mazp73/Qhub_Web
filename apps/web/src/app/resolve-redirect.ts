import { routeAllowed, type OrgRole } from '@/features/staff';

/** A dónde va el usuario según su estado. Pura y testeable. `null` = se queda donde está (también mientras carga). */
export function resolveRedirect(o: {
  location: string; authLoading: boolean; signedIn: boolean; membershipsLoading: boolean; hasOrganization: boolean; role: OrgRole | null; connected: boolean; mfa?: 'checking' | 'ok' | 'required';
  /** Hay una invitación por aceptar (llegó por el botón del correo). */
  pendingInvitation?: boolean;
}): string | null {
  const entry = ['/login', '/setup', '/connect', '/cargando', '/', '/verificacion'];
  const here = o.location;
  // Fix #3 (HIGH): el destinatario del correo de reset de Qhub llega ANÓNIMO. Estas rutas
  // son públicas y el chequeo va ANTES del guardado !signedIn (que si no, lo expulsa a
  // /login). Se normaliza el query string porque el enlace es /qhub/restablecer?token=...
  const path = here.split('?')[0];
  if (path === '/qhub/recuperar' || path === '/qhub/restablecer') return null;
  if (o.authLoading || (o.signedIn && o.mfa === 'checking')) return null;
  if (!o.signedIn) return here === '/login' ? null : '/login';
  if (o.mfa === 'required') return here === '/verificacion' ? null : '/verificacion';
  if (o.membershipsLoading) return null;
  if (here === '/verificacion') return '/inicio';
  if (here === '/invitacion') return null;                           // se acepta con o sin organización, y antes de conectar con Qhub
  if (o.pendingInvitation && (entry.includes(here) || !o.hasOrganization)) return '/invitacion';
  if (here === '/restablecer' || here === '/perfil') return o.hasOrganization || here === '/restablecer' ? null : '/setup';
  if (!o.hasOrganization) return here === '/setup' ? null : '/setup';
  if (!o.connected) return here === '/connect' ? null : '/connect';
  if (entry.includes(here)) return '/inicio';
  if (!routeAllowed(o.role, here)) return '/inicio';
  return null;
}
