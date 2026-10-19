import { guard, type Result } from '@qhub/core';
import type { NotificationRepository } from '../../domain/repositories';
import type { AppNotification } from '../../domain/entities';
import { call, mapError, type HttpTransport } from '../transport';
import * as M from '../mappers';
import { list, obj } from './shared';

export class NotificationRepositoryImpl implements NotificationRepository {
  constructor(private readonly t: HttpTransport) {}
  list(opts: { limit?: number; offset?: number } = {}): Promise<Result<AppNotification[]>> {
    return guard(async () => list(await call(this.t, { method: 'GET', path: '/notificaciones', query: { limite: opts.limit ?? 100, desde: opts.offset ?? 0 } })).map(M.notificationFromJson), mapError);
  }
  markRead(id: string) { return guard(async () => M.notificationFromJson(obj(await call(this.t, { method: 'PATCH', path: `/notificaciones/${id}/leida` }))), mapError); }
  delete(id: string): Promise<Result<void>> { return guard(async () => { await call(this.t, { method: 'DELETE', path: `/notificaciones/${id}` }); }, mapError); }
}
