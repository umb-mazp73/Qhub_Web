import type { IconName } from '@qhub/design';
import type { Permission } from '@/features/staff/permissions';

export interface NavItem { to: string; label: string; icon: IconName; needs: Permission; group: 'operacion' | 'organizacion' | 'cuenta'; keywords?: string }

/** Una sola fuente para el menú lateral y la búsqueda de la cabecera. */
export const NAV: readonly NavItem[] = [
  { to: '/inicio', label: 'Inicio', icon: 'dashboard', needs: 'dashboard.view', group: 'operacion', keywords: 'inicio accesos rápidos resumen panel' },
  { to: '/dashboard', label: 'Dashboard', icon: 'chart', needs: 'analytics.view', group: 'operacion', keywords: 'métricas gráficas reportes exportar csv pdf analítica' },
  { to: '/colas', label: 'Colas', icon: 'queue', needs: 'queues.view', group: 'operacion', keywords: 'filas horarios' },
  { to: '/en-vivo', label: 'En vivo', icon: 'live', needs: 'live.view', group: 'operacion', keywords: 'fila atender llamar turnos' },
  { to: '/historial', label: 'Historial', icon: 'history', needs: 'history.view', group: 'operacion', keywords: 'métricas reportes exportar csv' },
  { to: '/clientes', label: 'Clientes', icon: 'ticket', needs: 'clients.view', group: 'organizacion', keywords: 'personas usuarios app móvil bloquear' },
  { to: '/equipo', label: 'Equipo', icon: 'user', needs: 'team.view', group: 'organizacion', keywords: 'miembros roles invitar agentes' },
  { to: '/ajustes', label: 'Ajustes', icon: 'settings', needs: 'settings.manage', group: 'organizacion', keywords: 'organización publicar móvil conexión' },
  { to: '/notificaciones', label: 'Avisos', icon: 'bell', needs: 'notifications.view', group: 'cuenta', keywords: 'notificaciones alertas' },
  { to: '/perfil', label: 'Mi perfil', icon: 'user', needs: 'dashboard.view', group: 'cuenta', keywords: 'cuenta seguridad contraseña verificación sesiones accesibilidad' },
];
