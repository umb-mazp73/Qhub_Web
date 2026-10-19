import { guard, type Result } from '@qhub/core';
import { isoDate } from '../util';
import type { QueueRepository } from '../../domain/repositories';
import type { CreateQueueInput, Queue, QueueLimit, QueueState, Schedule, ScheduleInput, Slot } from '../../domain/entities';
import { call, mapError, type HttpTransport } from '../transport';
import * as M from '../mappers';
import { list, obj, type J } from './shared';

export class QueueRepositoryImpl implements QueueRepository {
  constructor(private readonly t: HttpTransport) {}
  list(opts: { active?: boolean } = {}): Promise<Result<Queue[]>> {
    return guard(async () => list(await call(this.t, { method: 'GET', path: '/colas', query: { activa: opts.active } })).map(M.queueFromJson), mapError);
  }
  get(id: string): Promise<Result<Queue>> {
    return guard(async () => M.queueFromJson(obj(await call(this.t, { method: 'GET', path: `/colas/${id}` }))), mapError);
  }
  create(input: CreateQueueInput): Promise<Result<Queue>> {
    return guard(async () => {
      const s = input.schedule;
      const body: J = {
        nombre: input.name.trim(),
        ...(input.description?.trim() ? { descripcion: input.description.trim() } : {}),
        ...(s ? M.scheduleToJson(s) : {}),
      };
      delete body.zona_horaria; // POST /colas no admite zona; se fija con PUT /horario
      return M.queueFromJson(obj(await call(this.t, { method: 'POST', path: '/colas', body })));
    }, mapError);
  }
  update(id: string, patch: { name?: string; description?: string; active?: boolean }): Promise<Result<Queue>> {
    return guard(async () => {
      const body: J = {};
      if (patch.name !== undefined) body.nombre = patch.name;
      if (patch.description !== undefined) body.descripcion = patch.description;
      if (patch.active !== undefined) body.activa = patch.active;
      return M.queueFromJson(obj(await call(this.t, { method: 'PATCH', path: `/colas/${id}`, body })));
    }, mapError);
  }
  delete(id: string): Promise<Result<void>> {
    return guard(async () => { await call(this.t, { method: 'DELETE', path: `/colas/${id}` }); }, mapError);
  }
  limit(): Promise<Result<QueueLimit>> {
    return guard(async () => M.queueLimitFromJson(obj(await call(this.t, { method: 'GET', path: '/colas/limite' }))), mapError);
  }
  schedule(id: string): Promise<Result<Schedule>> {
    return guard(async () => M.scheduleFromJson(obj(await call(this.t, { method: 'GET', path: `/colas/${id}/horario` }))), mapError);
  }
  replaceSchedule(id: string, input: ScheduleInput): Promise<Result<Schedule>> {
    return guard(async () => M.scheduleFromJson(obj(await call(this.t, { method: 'PUT', path: `/colas/${id}/horario`, body: M.scheduleToJson(input) }))), mapError);
  }
  slots(id: string, date?: Date): Promise<Result<Slot[]>> {
    return guard(async () => list(await call(this.t, { method: 'GET', path: `/colas/${id}/franjas`, query: { fecha: date ? isoDate(date) : undefined } })).map(M.slotFromJson), mapError);
  }
  state(id: string): Promise<Result<QueueState>> {
    return guard(async () => M.queueStateFromJson(obj(await call(this.t, { method: 'GET', path: `/colas/${id}/estado` }))), mapError);
  }
}
