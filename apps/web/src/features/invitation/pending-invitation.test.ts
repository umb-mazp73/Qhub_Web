import { afterEach, describe, expect, it } from 'vitest';
import { clearInvitation, pendingInvitation, rememberInvitation } from './pending-invitation';

describe('invitación pendiente', () => {
  afterEach(() => clearInvitation());
  it('recuerda un código válido y lo olvida al limpiar', () => {
    rememberInvitation('a1b2c3d4e5f6a1b2c3d4e5f6');
    expect(pendingInvitation()).toBe('a1b2c3d4e5f6a1b2c3d4e5f6');
    clearInvitation();
    expect(pendingInvitation()).toBeNull();
  });
  it('ignora lo que no parece un código (vacío, corto o con símbolos)', () => {
    for (const t of [null, undefined, '', 'abc', '<script>alert(1)</script>', 'con espacios 12345678']) rememberInvitation(t);
    expect(pendingInvitation()).toBeNull();
  });
});
