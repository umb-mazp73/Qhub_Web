import { describe, expect, it } from 'vitest';
import { resolveRedirect } from './resolve-redirect';
import { type OrgRole } from '@/features/staff';

const base = { location: '/', authLoading: false, signedIn: true, membershipsLoading: false, hasOrganization: true, role: 'admin' as OrgRole | null, connected: true, pendingInvitation: false };
const r = (o: Partial<typeof base>) => resolveRedirect({ ...base, ...o });

describe('resolveRedirect', () => {
  it('cargando no redirige (conserva la ruta al recargar)', () => { expect(r({ authLoading: true, location: '/historial' })).toBeNull(); expect(r({ membershipsLoading: true, location: '/historial' })).toBeNull(); });
  it('sin sesión → /login', () => { expect(r({ signedIn: false, location: '/colas' })).toBe('/login'); expect(r({ signedIn: false, location: '/login' })).toBeNull(); });
  it('sin organización → /setup; sin conexión → /connect', () => {
    expect(r({ hasOrganization: false })).toBe('/setup');
    expect(r({ connected: false, location: '/colas' })).toBe('/connect');
  });
  it('todo listo en páginas de acceso → /inicio', () => { for (const p of ['/login', '/setup', '/connect', '/cargando', '/']) expect(r({ location: p }), p).toBe('/inicio'); });
  it('el enlace de recuperación y el perfil no exigen conexión con Qhub', () => {
    expect(r({ location: '/restablecer', connected: false, hasOrganization: false })).toBeNull();
    expect(r({ location: '/perfil', connected: false })).toBeNull();
    expect(r({ location: '/perfil', hasOrganization: false })).toBe('/setup');
  });
  it('la invitación del correo se acepta con o sin organización y sin pasar por conectar con Qhub', () => {
    expect(r({ location: '/invitacion', hasOrganization: false, connected: false })).toBeNull();
    expect(r({ location: '/invitacion' })).toBeNull();
    expect(r({ signedIn: false, location: '/invitacion' })).toBe('/login');
  });
  it('con una invitación pendiente, al entrar se va a aceptarla en vez de a configurar o al inicio', () => {
    expect(r({ pendingInvitation: true, hasOrganization: false, location: '/setup' })).toBe('/invitacion');
    expect(r({ pendingInvitation: true, location: '/login' })).toBe('/invitacion');
    expect(r({ pendingInvitation: true, location: '/colas' })).toBeNull();
  });
  it('cada rol solo entra a lo que puede', () => {
    for (const p of ['/equipo', '/ajustes', '/colas/nueva', '/colas/abc']) expect(r({ location: p, role: 'agente' }), p).toBe('/inicio');
    expect(r({ location: '/en-vivo', role: 'agente' })).toBeNull();
    expect(r({ location: '/historial', role: 'recepcion' })).toBe('/inicio');
    expect(r({ location: '/equipo', role: 'supervisor' })).toBeNull();
    expect(r({ location: '/ajustes', role: 'supervisor' })).toBe('/inicio');
    expect(r({ location: '/ajustes' })).toBeNull();
  });
  it('la verificación en dos pasos pendiente manda a /verificacion antes de cargar nada', () => {
    const b = { location: '/inicio', authLoading: false, signedIn: true, membershipsLoading: true, hasOrganization: false, role: null, connected: false };
    expect(resolveRedirect({ ...b, mfa: 'required' })).toBe('/verificacion');
    expect(resolveRedirect({ ...b, mfa: 'required', location: '/verificacion' })).toBeNull();
    expect(resolveRedirect({ ...b, mfa: 'checking' })).toBeNull();
    expect(resolveRedirect({ ...b, mfa: 'ok', membershipsLoading: false, hasOrganization: true, role: 'admin', connected: true, location: '/verificacion' })).toBe('/inicio');
  });
});
