import type { OrgRole } from './roles';

export type Permission =
  | 'dashboard.view' | 'queues.view' | 'queues.manage' | 'live.view' | 'live.operate'
  | 'history.view' | 'team.view' | 'team.manage' | 'settings.manage'
  | 'clients.view' | 'clients.manage' | 'notifications.view' | 'export.data' | 'analytics.view';

const ALL: readonly Permission[] = ['dashboard.view', 'queues.view', 'queues.manage', 'live.view', 'live.operate', 'history.view', 'team.view', 'team.manage', 'settings.manage', 'clients.view', 'clients.manage', 'notifications.view', 'export.data', 'analytics.view'];

const NO_TEAM = (p: Permission) => p !== 'team.view' && p !== 'team.manage';
const BY_ROLE: Record<OrgRole, readonly Permission[]> = {
  admin: ALL,
  propietario: ALL.filter(NO_TEAM),   // cuenta personal: todo menos equipo
  supervisor: ['dashboard.view', 'queues.view', 'live.view', 'history.view', 'team.view', 'clients.view', 'notifications.view', 'export.data', 'analytics.view'],
  agente: ['dashboard.view', 'queues.view', 'live.view', 'live.operate', 'history.view', 'notifications.view', 'export.data', 'analytics.view'],
  recepcion: ['dashboard.view', 'queues.view', 'live.view', 'live.operate', 'notifications.view'],
};

export const can = (role: OrgRole | null | undefined, p: Permission): boolean => !!role && BY_ROLE[role].includes(p);

/** Permiso mínimo que exige cada ruta del panel (prefijo). */
const ROUTE_PERMISSION: ReadonlyArray<readonly [string, Permission]> = [
  ['/colas/nueva', 'queues.manage'], ['/colas/', 'queues.manage'], ['/colas', 'queues.view'],
  ['/en-vivo', 'live.view'], ['/historial', 'history.view'], ['/dashboard', 'analytics.view'], ['/clientes', 'clients.view'], ['/notificaciones', 'notifications.view'], ['/equipo', 'team.view'], ['/ajustes', 'settings.manage'], ['/inicio', 'dashboard.view'],
];
export function routeAllowed(role: OrgRole | null | undefined, path: string): boolean {
  const hit = ROUTE_PERMISSION.find(([prefix]) => path.startsWith(prefix));
  return hit ? can(role, hit[1]) : true;
}
