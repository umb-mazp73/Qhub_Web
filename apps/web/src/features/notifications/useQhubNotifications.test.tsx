import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import type { AppNotification } from '@qhub/api-client';
import { ana, adminMembership, FakeStaffRepository, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';
import { useQhubNotifications } from './useQhubNotifications';

const Probe = () => { useQhubNotifications(); return null; };
const aviso = (o: Partial<AppNotification> = {}): AppNotification => ({ id: 'a1', userId: 'u1', ticketId: 't1', message: 'Tu turno A-007 está siendo atendido', read: false, createdAt: new Date(), kind: 'turno_llamado', ...o });

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'guardado', expiresIn: 3600, issuedAt: new Date() }); return s; };
const connected = () => {
  const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
  return makeContainer({ staff, tokenStore: savedToken() });
};

afterEach(() => { localStorage.clear(); });

describe('avisos personales de Qhub (WS)', () => {
  it('con conexión, un aviso dispara un toast', async () => {
    const container = connected();
    await renderWith(<Probe />, container);
    await waitFor(() => expect(container.session.getSnapshot().connection.status).toBe('connected'), { timeout: 4000 });
    expect(container.fakes.realtime.notificationSubs.size).toBe(1);
    act(() => container.fakes.realtime.emitNotification(aviso()));
    expect(await screen.findByText('Tu turno A-007 está siendo atendido')).toBeInTheDocument();
    expect(screen.getByText('Es tu turno')).toBeInTheDocument();
  });

  it('sin conexión no abre la suscripción', async () => {
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const container = makeContainer({ staff });   // sin token guardado -> no conecta
    await renderWith(<Probe />, container);
    await waitFor(() => expect(container.session.getSnapshot().memberships.status).toBe('ready'), { timeout: 4000 });
    expect(container.session.getSnapshot().connection.status).not.toBe('connected');
    expect(container.fakes.realtime.notificationSubs.size).toBe(0);
  });
});
