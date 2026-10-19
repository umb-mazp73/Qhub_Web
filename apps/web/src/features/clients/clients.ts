import type { Result } from '@qhub/core';
import { toCsv } from '@qhub/core';

/** Persona que usa la organización desde la app móvil. */
export interface Client {
  userId: string; firstName: string; lastName: string; email: string | null; phone: string | null;
  firstSeen: Date | null; lastTicket: Date | null; tickets: number; served: number; noShow: number; cancelled: number; follows: boolean; blocked: boolean;
}
export interface ClientTicket { id: string; queueName: string | null; number: number | null; status: string; createdAt: Date }
export interface BlockedInfo { reason: string | null; createdAt: Date }

/** Permiso del cliente para que la organización edite sus datos. `vencida`: no respondió a tiempo o ya pasaron 24 h de aprobado. */
export type EditPermissionStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'usada' | 'vencida';
export interface EditPermission { status: EditPermissionStatus; requestedAt: Date; expiresAt: Date | null }
export const canRequestEdit = (p: EditPermission | null) => !p || p.status === 'rechazada' || p.status === 'usada' || p.status === 'vencida';

export interface ClientsRepository {
  list(orgId: string): Promise<Result<Client[]>>;
  history(orgId: string, userId: string, limit?: number): Promise<Result<ClientTicket[]>>;
  block(orgId: string, userId: string, reason: string): Promise<Result<void>>;
  unblock(orgId: string, userId: string): Promise<Result<void>>;
  blockInfo(orgId: string, userId: string): Promise<Result<BlockedInfo | null>>;
  /** Lo único que la organización puede hacer sin permiso del cliente además de bloquear: eliminarlo de su lista (borra su historial allí; la cuenta de la persona no se toca). */
  remove(orgId: string, userId: string): Promise<Result<void>>;
  /** Cambiar datos del cliente exige su permiso: se solicita, el cliente lo aprueba en la app móvil y sirve para un cambio en 24 h. */
  requestEdit(orgId: string, userId: string, reason: string): Promise<Result<void>>;
  editPermission(orgId: string, userId: string): Promise<Result<EditPermission | null>>;
  edit(orgId: string, userId: string, data: { firstName: string; lastName: string; phone: string }): Promise<Result<void>>;
}

export const clientName = (c: Pick<Client, 'firstName' | 'lastName'>): string => `${c.firstName} ${c.lastName}`.trim() || 'Sin nombre';
export const clientInitials = (c: Pick<Client, 'firstName' | 'lastName'>): string => ((c.firstName[0] ?? '') + (c.lastName[0] ?? '')).toUpperCase() || '?';

/** Tasa de no-show sobre los turnos resueltos (atendidos + no-show). */
export const noShowRate = (c: Pick<Client, 'served' | 'noShow'>): number => (c.served + c.noShow === 0 ? 0 : c.noShow / (c.served + c.noShow));

export type ClientFilter = 'todos' | 'siguen' | 'nuevos' | 'con_no_show' | 'bloqueados';
export const CLIENT_FILTERS: ReadonlyArray<{ value: ClientFilter; label: string }> = [
  { value: 'todos', label: 'Todos' }, { value: 'siguen', label: 'Vinculados a la organización' }, { value: 'nuevos', label: 'Nuevos (7 días)' },
  { value: 'con_no_show', label: 'Con no-show' }, { value: 'bloqueados', label: 'Bloqueados' },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filterClients(list: readonly Client[], o: { query: string; filter: ClientFilter; now?: Date }): Client[] {
  const now = o.now ?? new Date();
  const q = norm(o.query.trim());
  return list.filter((c) => {
    if (q && !norm(`${clientName(c)} ${c.email ?? ''} ${c.phone ?? ''}`).includes(q)) return false;
    switch (o.filter) {
      case 'siguen': return c.follows;
      case 'nuevos': return !!c.firstSeen && now.getTime() - c.firstSeen.getTime() <= 7 * 864e5;
      case 'con_no_show': return c.noShow > 0;
      case 'bloqueados': return c.blocked;
      default: return true;
    }
  });
}

export interface ClientStats { total: number; active30: number; new7: number; blocked: number; follow: number }
export function clientStats(list: readonly Client[], now = new Date()): ClientStats {
  const within = (d: Date | null, days: number) => !!d && now.getTime() - d.getTime() <= days * 864e5;
  return { total: list.length, active30: list.filter((c) => within(c.lastTicket, 30)).length, new7: list.filter((c) => within(c.firstSeen, 7)).length, blocked: list.filter((c) => c.blocked).length, follow: list.filter((c) => c.follows).length };
}

/** CSV de clientes; el contacto solo viaja si el rol lo recibió (admin). */
export function clientsToCsv(list: readonly Client[]): string {
  return toCsv([
    'nombre,correo,telefono,primera_vez,ultimo_turno,turnos,atendidos,no_show,cancelados,sigue,bloqueado',
    ...list.map((c) => [clientName(c), c.email, c.phone, c.firstSeen?.toISOString(), c.lastTicket?.toISOString(), c.tickets, c.served, c.noShow, c.cancelled, c.follows ? 'si' : 'no', c.blocked ? 'si' : 'no']),
  ]);
}
