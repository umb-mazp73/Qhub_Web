export type AccountType = 'empresa' | 'usuario';

/** Rol que el sistema integrador informa en `X-Usuario-Rol`. */
export type ActorRole = 'admin' | 'agente' | 'cliente';

export interface Actor { readonly userId: string; readonly role: ActorRole }

export type TicketStatus = 'en_espera' | 'atendiendo' | 'finalizado' | 'cancelado' | 'no_show';
export const TICKET_STATUSES: readonly TicketStatus[] = ['en_espera', 'atendiendo', 'finalizado', 'cancelado', 'no_show'];
/** Nombres fijos del design system. */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  en_espera: 'En espera', atendiendo: 'Atendiendo', finalizado: 'Finalizado', cancelado: 'Cancelado', no_show: 'No-show',
};
export const isActiveStatus = (s: TicketStatus) => s === 'en_espera' || s === 'atendiendo';
/** Solo cancelado y no-show liberan el cupo de la franja. */
export const releasesSlot = (s: TicketStatus) => s === 'cancelado' || s === 'no_show';
export const parseTicketStatus = (v: string): TicketStatus => (TICKET_STATUSES as readonly string[]).includes(v) ? (v as TicketStatus) : 'en_espera';

export interface AuthToken { readonly accessToken: string; readonly expiresIn: number; readonly issuedAt: Date }
export const tokenExpiresAt = (t: AuthToken) => new Date(t.issuedAt.getTime() + t.expiresIn * 1000);
export const isTokenExpired = (t: AuthToken, now = new Date(), skewMs = 30_000) => now.getTime() > tokenExpiresAt(t).getTime() - skewMs;

export interface Registration {
  readonly accountType: AccountType; readonly accountId: string; readonly username: string; readonly email: string;
  readonly companyName?: string | null; readonly queueLimit: number; readonly createdAt: Date;
}

export interface RegisterInput {
  readonly accountType: AccountType; readonly companyName?: string; readonly firstName: string; readonly lastName: string;
  readonly username: string; readonly email: string; readonly password: string; readonly country: string; readonly city: string;
  readonly acceptedTerms: boolean;
}

export interface Queue { readonly id: string; readonly ownerName: string; readonly name: string; readonly description: string | null; readonly active: boolean }

/** Horario con valores derivados que calcula la API. `days`: ISO 1=lunes … 7=domingo. */
export interface Schedule {
  readonly queueId: string; readonly timeZone: string; readonly opens: string; readonly closes: string; readonly slotMinutes: number;
  readonly days: readonly number[]; readonly turnMinutes: number; readonly stations: number; readonly dailyCapacity: number;
  readonly maxDaysAhead: number; readonly slotsPerDay: number; readonly capacityPerSlot: number; readonly turnsPerDay: number;
}

/** Datos para `PUT /colas/{id}/horario` (se reemplaza completo). */
export interface ScheduleInput {
  readonly opens: string; readonly closes: string; readonly slotMinutes: number; readonly days: readonly number[];
  readonly turnMinutes: number; readonly maxDaysAhead: number; readonly stations?: number; readonly dailyCapacity?: number; readonly timeZone?: string;
}

/** Cupos por franja: `floor(franja / trámite) × puestos`. Misma regla que la API. */
export const capacityPerSlot = (s: Pick<ScheduleInput, 'slotMinutes' | 'turnMinutes' | 'stations'>) =>
  s.turnMinutes <= 0 ? 0 : Math.floor(s.slotMinutes / s.turnMinutes) * (s.stations ?? 1);

export interface CreateQueueInput { readonly name: string; readonly description?: string; readonly schedule?: ScheduleInput }

export interface Slot { readonly start: Date; readonly end: Date; readonly capacity: number; readonly taken: number; readonly available: number }
export const slotIsFull = (s: Slot) => s.available <= 0;
export const slotIsLow = (s: Slot) => s.available > 0 && s.available <= 2;

export interface QueueState { readonly queueId: string; readonly waiting: number; readonly serving: number }
export interface QueueLimit { readonly accountType: AccountType; readonly limit: number; readonly active: number; readonly available: number }

export interface Ticket {
  readonly id: string; readonly queueId: string; readonly ownerName: string; readonly userId: string; readonly slotStart: Date;
  readonly scheduled: boolean; readonly number: number; readonly status: TicketStatus; readonly position: number; readonly createdAt: Date;
  readonly calledAt: Date | null; readonly finishedAt: Date | null; readonly agentId: string | null;
}

export interface TicketFilter { readonly queueId?: string; readonly status?: TicketStatus; readonly date?: Date; readonly limit?: number; readonly offset?: number }

export interface AppNotification {
  readonly id: string; readonly userId: string; readonly ticketId: string | null; readonly message: string; readonly read: boolean;
  readonly createdAt: Date; readonly kind: string | null; // turno_llamado · turno_pospuesto · turno_no_show · recordatorio
}

export type QueueEventType = 'turno_creado' | 'turno_llamado' | 'turno_pospuesto' | 'turno_cancelado' | 'turno_no_show' | 'cola_actualizada' | 'desconocido';
export interface QueueEvent { readonly type: QueueEventType; readonly queueId: string; readonly ticket: Ticket | null }

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface Readiness { readonly supabase: string; readonly rabbitmq: string }
export const isReady = (r: Readiness) => r.supabase === 'ok';
