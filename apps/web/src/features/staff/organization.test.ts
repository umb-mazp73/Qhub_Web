import { describe, expect, it } from 'vitest';
import { invitationPending } from '@/features/staff';

describe('organización', () => {
  it('invitaciones vigentes', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    expect(invitationPending({ id: '1', email: 'a', role: 'agente', token: 't', expiresAt: new Date('2026-10-25T00:00:00Z'), acceptedAt: null }, now)).toBe(true);
    expect(invitationPending({ id: '1', email: 'a', role: 'agente', token: 't', expiresAt: new Date('2026-10-19T00:00:00Z'), acceptedAt: null }, now)).toBe(false);
    expect(invitationPending({ id: '1', email: 'a', role: 'agente', token: 't', expiresAt: new Date('2026-10-25T00:00:00Z'), acceptedAt: now }, now)).toBe(false);
  });
});
