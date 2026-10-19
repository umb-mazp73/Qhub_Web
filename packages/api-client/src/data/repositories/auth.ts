import { guard, type Result } from '@qhub/core';
import { type AuthRepositoryDeps } from '../util';
import type { AuthRepository } from '../../domain/repositories';
import type { AuthToken, RegisterInput, Registration } from '../../domain/entities';
import { call, mapError, type HttpTransport } from '../transport';
import * as M from '../mappers';
import { obj } from './shared';

export class AuthRepositoryImpl implements AuthRepository {
  constructor(private readonly t: HttpTransport, private readonly deps: AuthRepositoryDeps = {}) {}
  login(identifier: string, password: string): Promise<Result<AuthToken>> {
    return guard(async () => {
      const b = obj(await call(this.t, { method: 'POST', path: '/auth/token', body: { identificador: identifier, password } }));
      return { accessToken: String(b.access_token), expiresIn: Number(b.expires_in), issuedAt: (this.deps.now ?? (() => new Date()))() };
    }, mapError);
  }
  register(input: RegisterInput): Promise<Result<Registration>> {
    return guard(async () => M.registrationFromJson(obj(await call(this.t, { method: 'POST', path: '/auth/registro', body: M.registerToJson(input) }))), mapError);
  }
}
