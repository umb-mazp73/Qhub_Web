import { guard, type Result } from '@qhub/core';
import type { HealthRepository } from '../../domain/repositories';
import type { Readiness } from '../../domain/entities';
import { call, mapError, type HttpTransport } from '../transport';
import { obj } from './shared';

export class HealthRepositoryImpl implements HealthRepository {
  constructor(private readonly t: HttpTransport) {}
  ready(): Promise<Result<Readiness>> {
    return guard(async () => {
      const b = obj(await call(this.t, { method: 'GET', path: '/listo' }, [200, 503]));
      return { supabase: String(b.supabase ?? 'desconocido'), rabbitmq: String(b.rabbitmq ?? 'desconocido') };
    }, mapError);
  }
}
