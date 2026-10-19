import { err, ok, unauthorizedFailure, type Failure, type Result } from '@qhub/core';
import type { ApiContext, Actor, AuthRepository } from '@qhub/api-client';
import { isTokenExpired, tokenExpiresAt, type AuthToken } from '@qhub/api-client';
import type { QhubLinkRepository } from './link';
import type { CredentialVault } from './vault';

/**
 * Almacén del token de la API Qhub para sobrevivir a un refresco de página (solo mientras dura la pestaña).
 * La contraseña NUNCA se guarda en el navegador.
 */
export interface TokenStore {
  save(orgId: string, token: AuthToken): void;
  load(orgId: string): AuthToken | null;
  clear(orgId: string): void;
}

export type ConnectionState =
  | { status: 'disconnected'; reason?: Failure }
  /** `auto`: se está usando la conexión guardada (sin que la persona escriba nada); la puerta de acceso muestra la carga. */
  | { status: 'connecting'; auto?: boolean }
  | { status: 'connected'; expiresAt: Date };

/** Inicia sesión en la API Qhub y deja el contexto listo para los repositorios. */
export class ConnectToQhub {
  constructor(private readonly auth: AuthRepository, private readonly context: ApiContext, private readonly store: TokenStore, private readonly link?: QhubLinkRepository, private readonly vault?: CredentialVault) {}

  async login(args: { orgId: string; actor: Actor; identifier: string; password: string }): Promise<Result<Date>> {
    const res = await this.auth.login(args.identifier.trim(), args.password);
    if (!res.ok) return err(res.failure);
    this.apply(args.orgId, args.actor, res.value);
    return ok(tokenExpiresAt(res.value));
  }

  /** ¿Hay una conexión guardada en este dispositivo para esa organización? */
  hasDeviceConnection(orgId: string): Promise<boolean> { return this.vault?.has(orgId) ?? Promise.resolve(false); }

  /**
   * Conexión guardada: primero la del servidor (sirve en cualquier equipo y la contraseña no sale de allí); si no la hay,
   * la de este dispositivo. La persona no escribe nada. Si la guardada ya no sirve, se descarta y se pide conectar.
   */
  async autoConnect(args: { orgId: string; actor: Actor; useServer?: boolean }): Promise<Result<Date>> {
    let last: Failure | null = null;
    if (this.link && (args.useServer ?? true)) {
      const res = await this.link.issueToken(args.orgId);
      if (res.ok) { this.apply(args.orgId, args.actor, res.value); return ok(tokenExpiresAt(res.value)); }
      last = res.failure;
    }
    const saved = await this.vault?.load(args.orgId);
    if (saved) {
      const res = await this.auth.login(saved.identifier, saved.password);
      if (res.ok) { this.apply(args.orgId, args.actor, res.value); return ok(tokenExpiresAt(res.value)); }
      if (res.failure.kind === 'unauthorized') await this.vault?.clear(args.orgId);          // la contraseña cambió: no insistir
      return err(res.failure.kind === 'unauthorized' ? unauthorizedFailure('La contraseña de Qhub guardada ya no es válida. Conecta tu cuenta de nuevo.') : res.failure);
    }
    return err(last ?? unauthorizedFailure());
  }

  /** Guarda la conexión en este dispositivo. */
  saveOnDevice(orgId: string, identifier: string, password: string): Promise<boolean> { return this.vault?.save(orgId, { identifier: identifier.trim(), password }) ?? Promise.resolve(false); }
  forgetDevice(orgId: string): Promise<void> { return this.vault?.clear(orgId) ?? Promise.resolve(); }

  /** Reutiliza el token guardado de la pestaña si sigue vigente. */
  restore(args: { orgId: string; actor: Actor; now?: Date }): Date | null {
    const saved = this.store.load(args.orgId);
    if (!saved || isTokenExpired(saved, args.now ?? new Date())) { this.store.clear(args.orgId); return null; }
    this.context.token = saved.accessToken;
    this.context.actor = args.actor;
    return tokenExpiresAt(saved);
  }

  private apply(orgId: string, actor: Actor, token: AuthToken) {
    this.context.token = token.accessToken;
    this.context.actor = actor;
    this.store.save(orgId, token);
  }

  disconnect(orgId?: string) {
    this.context.clear();
    if (orgId) this.store.clear(orgId);
  }
}
