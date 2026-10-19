import { afterEach, describe, expect, it } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { ana, adminMembership, FakeNotices, FakeNotificationsRealtime, FakeStaffRepository, makeNotice, MemoryTokenStore } from '@/testing/fakes';
import { makeContainer, renderWith } from '@/testing/harness';
import { useNotices } from './useNotices';

let hook: ReturnType<typeof useNotices> | null = null;
const Probe = () => { hook = useNotices({ limit: 10 }); return null; };

const savedToken = () => { const s = new MemoryTokenStore(); s.save('org1', { accessToken: 'g', expiresIn: 3600, issuedAt: new Date() }); return s; };

afterEach(() => { localStorage.clear(); hook = null; });

describe('useNotices en tiempo real', () => {
  it('un cambio del canal refresca la lista y el conteo', async () => {
    const notices = new FakeNotices([makeNotice('n1', { read: false })]);
    const rt = new FakeNotificationsRealtime();
    const staff = new FakeStaffRepository({ user: ana, memberships: [adminMembership] });
    const container = makeContainer({ staff, notices, staffNoticesRealtime: rt, tokenStore: savedToken() });
    await renderWith(<Probe />, container);
    await waitFor(() => expect(hook?.unread).toBe(1), { timeout: 4000 });
    // El canal reporta `connected` al suscribir.
    expect(rt.handlers.has('org1')).toBe(true);

    // Nuevo aviso en la fuente + evento del canal -> se invalida y vuelve a leer.
    notices.items = [...notices.items, makeNotice('n2', { read: false })];
    act(() => rt.emit('org1'));
    await waitFor(() => expect(hook?.unread).toBe(2), { timeout: 4000 });
  });
});
