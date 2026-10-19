import type { HistoryStats } from '@/features/history/history';

/** Frase de resumen de la cabecera: lo más importante del día en una línea. */
export function summaryLine(canSeeStats: boolean, loading: boolean, today: HistoryStats, activeQueues: number): string {
  if (!canSeeStats) return activeQueues === 0 ? 'Todavía no hay colas activas.' : `${activeQueues} ${activeQueues === 1 ? 'cola activa' : 'colas activas'} en este momento.`;
  if (loading) return 'Cargando el resumen de hoy…';
  if (today.total === 0) return activeQueues === 0 ? 'Aún no hay turnos hoy. Crea una cola para empezar a recibirlos.' : 'Aún no hay turnos hoy. Cuando lleguen, los verás aquí al instante.';
  return `Hoy: ${today.total} ${today.total === 1 ? 'turno' : 'turnos'}, ${today.attended} atendidos y ${today.waiting} en espera.`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export interface SetupStep { id: string; label: string; hint: string; done: boolean; to: string }

/** Lista de arranque: lo que falta para operar de punta a punta y cuidar la cuenta. Cada rol ve solo lo que puede hacer. */
export function setupSteps(o: { admin: boolean; personal?: boolean; profileComplete: boolean; mfaEnabled: boolean; orgLocated: boolean; hasQueues: boolean; published: boolean; teamSize: number }): SetupStep[] {
  const personal: SetupStep[] = [
    { id: 'profile', label: 'Completar tu perfil', hint: 'Nombre, teléfono, país y ciudad.', done: o.profileComplete, to: '/perfil' },
    { id: 'mfa', label: 'Activar la verificación en dos pasos', hint: 'Protege tu cuenta con una app autenticadora.', done: o.mfaEnabled, to: '/perfil?tab=seguridad' },
  ];
  if (!o.admin) return personal;
  return [
    ...personal,
    { id: 'org', label: o.personal ? 'Completar los datos de tu cuenta' : 'Completar los datos de la organización', hint: 'País y ciudad, para que el público te encuentre.', done: o.orgLocated, to: '/ajustes' },
    { id: 'queue', label: 'Crear tu primera cola', hint: 'Con su horario, franjas y cupos.', done: o.hasQueues, to: '/colas/nueva' },
    { id: 'publish', label: o.personal ? 'Publicar tu cuenta en la app móvil' : 'Publicar la organización en la app móvil', hint: 'Así el público podrá sacar turnos.', done: o.published, to: '/ajustes' },
    ...(o.personal ? [] : [{ id: 'team', label: 'Invitar a tu equipo', hint: 'Agentes, recepción y supervisores.', done: o.teamSize > 1, to: '/equipo' }]),
  ];
}
