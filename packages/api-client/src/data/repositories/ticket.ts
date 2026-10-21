import { guard, type Result } from '@qhub/core';
import { isoDate } from '../util';
import type { TicketRepository } from '../../domain/repositories';
import type { Ticket, TicketFilter } from '../../domain/entities';
import { call, mapError, type HttpTransport } from '../transport';
import * as M from '../mappers';
import { list, obj } from './shared';

/** La API solo deja atender, finalizar o marcar no-show a quien actúa como `agente`: un administrador o titular que opera la fila lo hace como tal. */
const OPERATOR_ROLE = 'agente' as const;

export class TicketRepositoryImpl implements TicketRepository {
  constructor(private readonly t: HttpTransport) {}
  private one(b: unknown): Ticket { return M.ticketFromJson(obj(b)); }
  create(queueId: string, slotStart?: Date): Promise<Result<Ticket>> {
    return guard(async () => this.one(await call(this.t, { method: 'POST', path: '/turnos', body: { cola_id: queueId, ...(slotStart ? { franja_inicio: slotStart.toISOString() } : {}) } })), mapError);
  }
  mine(opts: { limit?: number; offset?: number } = {}): Promise<Result<Ticket[]>> {
    return guard(async () => list(await call(this.t, { method: 'GET', path: '/turnos/mios', query: { limite: opts.limit ?? 500, desde: opts.offset ?? 0 } })).map(M.ticketFromJson), mapError);
  }
  list(f: TicketFilter): Promise<Result<Ticket[]>> {
    return guard(async () => list(await call(this.t, {
      method: 'GET', path: '/turnos',
      query: { cola_id: f.queueId, estado: f.status, fecha: f.date ? isoDate(f.date) : undefined, limite: f.limit ?? 500, desde: f.offset ?? 0 },
    })).map(M.ticketFromJson), mapError);
  }
  get(id: string) { return guard(async () => this.one(await call(this.t, { method: 'GET', path: `/turnos/${id}` })), mapError); }
  postpone(id: string) { return guard(async () => this.one(await call(this.t, { method: 'PATCH', path: `/turnos/${id}/posponer` })), mapError); }
  cancel(id: string) { return guard(async () => this.one(await call(this.t, { method: 'PATCH', path: `/turnos/${id}/cancelar` })), mapError); }
  call(id: string) { return guard(async () => this.one(await call(this.t, { method: 'PATCH', path: `/turnos/${id}/atender`, actorRole: OPERATOR_ROLE })), mapError); }
  finish(id: string) { return guard(async () => this.one(await call(this.t, { method: 'PATCH', path: `/turnos/${id}/finalizar`, actorRole: OPERATOR_ROLE })), mapError); }
  noShow(id: string) { return guard(async () => this.one(await call(this.t, { method: 'PATCH', path: `/turnos/${id}/no-show`, actorRole: OPERATOR_ROLE })), mapError); }
}
