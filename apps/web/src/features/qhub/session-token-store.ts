import type { AuthToken } from '@qhub/api-client';
import type { TokenStore } from './connection';

/** `sessionStorage`: muere al cerrar la pestaña y no es compartido entre pestañas. */
export class SessionTokenStore implements TokenStore {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.sessionStorage) {}
  private key = (orgId: string) => `qhub.token.${orgId}`;
  save(orgId: string, t: AuthToken) {
    try { this.storage.setItem(this.key(orgId), JSON.stringify({ a: t.accessToken, e: t.expiresIn, i: t.issuedAt.toISOString() })); } catch { /* storage bloqueado */ }
  }
  load(orgId: string): AuthToken | null {
    try {
      const raw = this.storage.getItem(this.key(orgId));
      if (!raw) return null;
      const j = JSON.parse(raw) as { a: string; e: number; i: string };
      return { accessToken: j.a, expiresIn: j.e, issuedAt: new Date(j.i) };
    } catch { return null; }
  }
  clear(orgId: string) { try { this.storage.removeItem(this.key(orgId)); } catch { /* nada */ } }
}
