import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ToastProvider } from '@/shared/ui';
import { ContainerProvider, type Container } from '@/app/container';
import {
  FakeAuthRepository, FakeClients, FakeQhubLink, FakeVault, FakeHealth, FakeNotices, FakeNotificationsRealtime, FakeNotifications, FakeSecurity, FakeQueueRepository, FakeRealtime, FakeStaffRepository, FakeTicketRepository, MemoryTokenStore, buildTestSession, testEnv,
} from './fakes';

export type TestContainer = Container & { fakes: { staff: FakeStaffRepository; auth: FakeAuthRepository; queues: FakeQueueRepository; tickets: FakeTicketRepository; realtime: FakeRealtime; tokenStore: MemoryTokenStore; notices: FakeNotices; staffNoticesRealtime: FakeNotificationsRealtime; clients: FakeClients; security: FakeSecurity; qhubLink: FakeQhubLink; vault: FakeVault } };

export function makeContainer(o: Partial<TestContainer['fakes']> = {}): TestContainer {
  const staff = o.staff ?? new FakeStaffRepository();
  const auth = o.auth ?? new FakeAuthRepository();
  const queues = o.queues ?? new FakeQueueRepository();
  const tickets = o.tickets ?? new FakeTicketRepository();
  const realtime = o.realtime ?? new FakeRealtime();
  const tokenStore = o.tokenStore ?? new MemoryTokenStore();
  const notices = o.notices ?? new FakeNotices();
  const staffNoticesRealtime = o.staffNoticesRealtime ?? new FakeNotificationsRealtime();
  const clients = o.clients ?? new FakeClients();
  const security = o.security ?? new FakeSecurity();
  const qhubLink = o.qhubLink ?? new FakeQhubLink();
  const vault = o.vault ?? new FakeVault();
  const { context, session } = buildTestSession(staff, auth, tokenStore, security, qhubLink, vault);
  return { env: testEnv, staff, staffNotices: notices, staffNoticesRealtime, clients, security, qhubLink, auth, queues, tickets, realtime, tokenStore, context, notifications: new FakeNotifications(), health: new FakeHealth(), session, fakes: { staff, auth, queues, tickets, realtime, tokenStore, notices, staffNoticesRealtime, clients, security, qhubLink, vault } };
}

/** Renderiza con la sesión ya resuelta (usuario y organización cargados), como detrás de la puerta de acceso. */
export async function renderWith(ui: ReactElement, c: TestContainer, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  c.session.start();
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  const user = userEvent.setup();
  const utils = render(
    <ContainerProvider value={c}><QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></ToastProvider></QueryClientProvider></ContainerProvider>,
  );
  return { user, ...utils };
}
