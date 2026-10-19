import type { Result } from '@qhub/core';
import type {
  AppNotification, AuthToken, ConnectionStatus, CreateQueueInput, Queue, QueueEvent, QueueLimit, QueueState, Readiness,
  RegisterInput, Registration, Schedule, ScheduleInput, Slot, Ticket, TicketFilter,
} from './entities';

export interface AuthRepository {
  /** `POST /auth/token` con email o nombre de usuario. */
  login(identifier: string, password: string): Promise<Result<AuthToken>>;
  /** `POST /auth/registro`. */
  register(input: RegisterInput): Promise<Result<Registration>>;
}

export interface QueueRepository {
  list(opts?: { active?: boolean }): Promise<Result<Queue[]>>;
  get(id: string): Promise<Result<Queue>>;
  create(input: CreateQueueInput): Promise<Result<Queue>>;
  update(id: string, patch: { name?: string; description?: string; active?: boolean }): Promise<Result<Queue>>;
  delete(id: string): Promise<Result<void>>;
  limit(): Promise<Result<QueueLimit>>;
  schedule(id: string): Promise<Result<Schedule>>;
  replaceSchedule(id: string, input: ScheduleInput): Promise<Result<Schedule>>;
  slots(id: string, date?: Date): Promise<Result<Slot[]>>;
  state(id: string): Promise<Result<QueueState>>;
}

export interface TicketRepository {
  /** Sin `slotStart` = en vivo; con él = programado. */
  create(queueId: string, slotStart?: Date): Promise<Result<Ticket>>;
  mine(opts?: { limit?: number; offset?: number }): Promise<Result<Ticket[]>>;
  list(filter: TicketFilter): Promise<Result<Ticket[]>>;
  get(id: string): Promise<Result<Ticket>>;
  postpone(id: string): Promise<Result<Ticket>>;
  cancel(id: string): Promise<Result<Ticket>>;
  call(id: string): Promise<Result<Ticket>>; // atender
  finish(id: string): Promise<Result<Ticket>>;
  noShow(id: string): Promise<Result<Ticket>>;
}

export interface NotificationRepository {
  list(opts?: { limit?: number; offset?: number }): Promise<Result<AppNotification[]>>;
  markRead(id: string): Promise<Result<AppNotification>>;
  delete(id: string): Promise<Result<void>>;
}

export interface QueueSubscription {
  onEvent(e: QueueEvent): void;
  onError?(e: Error): void;
  onStatus?(s: ConnectionStatus): void;
}

export interface RealtimeRepository {
  /** Eventos de una cola. Reconecta solo. Devuelve la función que cancela la suscripción. */
  subscribeQueue(queueId: string, sub: QueueSubscription): () => void;
  /** Avisos personales de la persona actual. */
  subscribeNotifications(sub: { onNotification(n: AppNotification): void; onError?(e: Error): void; onStatus?(s: ConnectionStatus): void }): () => void;
}

export interface HealthRepository {
  ready(): Promise<Result<Readiness>>;
}
