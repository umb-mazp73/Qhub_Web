import { describe, expect, it } from 'vitest';
import { toActorRole, effectiveRole, isAdmin, ORG_ROLES } from '@/features/staff';
import { can, routeAllowed } from '@/features/staff/permissions';

describe('permisos', () => {
  it('matriz por rol', () => {
    expect(can('admin', 'settings.manage')).toBe(true);
    expect(can('supervisor', 'live.operate')).toBe(false); expect(can('supervisor', 'history.view')).toBe(true); expect(can('supervisor', 'team.manage')).toBe(false);
    expect(can('agente', 'live.operate')).toBe(true); expect(can('agente', 'queues.manage')).toBe(false);
    expect(can('recepcion', 'history.view')).toBe(false); expect(can('recepcion', 'live.operate')).toBe(true);
    expect(can(null, 'dashboard.view')).toBe(false);
  });
  it('rutas', () => { expect(routeAllowed('agente', '/colas')).toBe(true); expect(routeAllowed('agente', '/colas/nueva')).toBe(false); expect(routeAllowed('recepcion', '/perfil')).toBe(true); });
  it('la API solo conoce admin y agente', () => { expect(toActorRole('admin')).toBe('admin'); for (const x of ['supervisor', 'agente', 'recepcion'] as const) expect(toActorRole(x)).toBe('agente'); });
});
describe('permisos de clientes y avisos', () => {
  it('quién ve y quién gestiona', () => {
    expect(can('admin', 'clients.manage')).toBe(true); expect(can('supervisor', 'clients.view')).toBe(true); expect(can('supervisor', 'clients.manage')).toBe(false);
    for (const r of ['agente', 'recepcion'] as const) { expect(can(r, 'clients.view'), r).toBe(false); expect(can(r, 'notifications.view'), r).toBe(true); }       // los avisos son de todos los roles
    expect(can('supervisor', 'notifications.view')).toBe(true); expect(can('recepcion', 'export.data')).toBe(false);
    expect(routeAllowed('agente', '/clientes')).toBe(false); expect(routeAllowed('supervisor', '/clientes')).toBe(true); expect(routeAllowed('supervisor', '/notificaciones')).toBe(true);
  });
});

describe('cuenta personal (titular)', () => {
  it('el titular puede todo menos gestionar equipo', () => {
    expect(effectiveRole('admin', 'persona')).toBe('propietario'); expect(effectiveRole('admin', 'empresa')).toBe('admin'); expect(effectiveRole('agente', 'persona')).toBe('agente');
    expect(toActorRole('propietario')).toBe('admin');
    for (const p of ['queues.manage', 'settings.manage', 'clients.manage', 'live.operate', 'history.view', 'export.data'] as const) expect(can('propietario', p), p).toBe(true);
    for (const p of ['team.view', 'team.manage'] as const) expect(can('propietario', p), p).toBe(false);
    expect(routeAllowed('propietario', '/equipo')).toBe(false); expect(routeAllowed('propietario', '/ajustes')).toBe(true);
    expect(isAdmin({ organization: { id: 'o', code: 'QH-TEST22', kind: 'persona', qhubConnected: false, name: 'x', slug: 'x', timeZone: 'UTC', published: false, linked: false }, role: 'propietario' })).toBe(true);
  });
  it('los roles asignables al equipo no incluyen al titular', () => { expect(ORG_ROLES).not.toContain('propietario'); expect(ORG_ROLES).toHaveLength(4); });
});
