import { describe, expect, it } from 'vitest';
import { describeBrowser, mfaRequired, qrSrc, securityChecks, validateTotp } from '@/features/security/security';

describe('seguridad (dominio)', () => {
  it('TOTP, nivel de aseguramiento y nivel de seguridad', () => {
    expect(validateTotp('123456')).toBeNull(); expect(validateTotp('12 34 56')).toBeNull(); expect(validateTotp('12345')).not.toBeNull(); expect(validateTotp('abcdef')).not.toBeNull();
    expect(mfaRequired({ current: 'aal1', next: 'aal2' })).toBe(true); expect(mfaRequired({ current: 'aal2', next: 'aal2' })).toBe(false); expect(mfaRequired({ current: 'aal1', next: 'aal1' })).toBe(false);
    expect(securityChecks({ emailConfirmed: true, mfa: false, phone: true }).score).toBe(2);
  });
  it('describeBrowser y qrSrc', () => {
    expect(describeBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome en Windows');
    expect(describeBrowser('Mozilla/5.0 (X11; Linux) Firefox/120')).toBe('Firefox en Linux');
    expect(qrSrc('data:image/svg+xml;utf-8,<svg/>')).toMatch(/^data:/); expect(qrSrc('<svg/>')).toBe('data:image/svg+xml;utf-8,%3Csvg%2F%3E');
  });
});
