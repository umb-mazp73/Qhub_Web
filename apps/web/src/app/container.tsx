import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  ApiContext, AuthRepositoryImpl, FetchTransport, HealthRepositoryImpl, NotificationRepositoryImpl, QueueRepositoryImpl, RealtimeRepositoryImpl, TicketRepositoryImpl,
  type AuthRepository, type HealthRepository, type NotificationRepository, type QueueRepository, type RealtimeRepository, type TicketRepository,
} from '@qhub/api-client';
import { ConnectToQhub, type TokenStore } from '@/features/qhub/connection';
import { SessionTokenStore } from '@/features/qhub/session-token-store';
import { SupabaseStaffRepository } from '@/features/staff/supabase-staff-repository';
import type { StaffRepository } from '@/features/staff';
import { SupabaseNotificationsRepository } from '@/features/notifications/supabase-notifications-repository';
import { SupabaseNotificationsRealtime } from '@/features/notifications/supabase-notifications-realtime';
import type { NotificationsRealtime, NotificationsRepository } from '@/features/notifications/notifications';
import { SupabaseClientsRepository } from '@/features/clients/supabase-clients-repository';
import type { ClientsRepository } from '@/features/clients/clients';
import { SupabaseQhubLinkRepository } from '@/features/qhub/supabase-qhub-link-repository';
import type { QhubLinkRepository } from '@/features/qhub/link';
import { DeviceCredentialVault } from '@/features/qhub/device-credential-vault';
import { SupabaseSecurityRepository } from '@/features/security/supabase-security-repository';
import type { SecurityRepository } from '@/features/security/security';
import type { AppEnv } from './env';
import { AppSession, type SessionSnapshot } from '@/features/session/app-session';

/** Raíz de composición: todas las dependencias de la app. En tests se sustituye por fakes. */
export interface Container {
  env: AppEnv;
  staff: StaffRepository;
  /** Avisos del equipo (Supabase). No confundir con `notifications`, que son los avisos de la API Qhub. */
  staffNotices: NotificationsRepository;
  /** Tiempo real de los avisos del equipo (Supabase Realtime). */
  staffNoticesRealtime: NotificationsRealtime;
  clients: ClientsRepository;
  security: SecurityRepository;
  /** Conexión de la organización con Qhub guardada en el servidor (conectar una vez, publicar). */
  qhubLink: QhubLinkRepository;
  context: ApiContext;
  auth: AuthRepository;
  queues: QueueRepository;
  tickets: TicketRepository;
  notifications: NotificationRepository;
  realtime: RealtimeRepository;
  health: HealthRepository;
  tokenStore: TokenStore;
  session: AppSession;
}

export function buildContainer(env: AppEnv): Container {
  const sb = createClient(env.supabaseUrl, env.supabaseKey);
  const context = new ApiContext();
  const transport = new FetchTransport({ baseUrl: env.apiBaseUrl, context });
  const staff = new SupabaseStaffRepository(sb);
  const auth = new AuthRepositoryImpl(transport);
  const tokenStore = new SessionTokenStore();
  const security = new SupabaseSecurityRepository(sb);
  const qhubLink = new SupabaseQhubLinkRepository(sb);
  return {
    env, staff, context, auth, tokenStore,
    staffNotices: new SupabaseNotificationsRepository(sb), staffNoticesRealtime: new SupabaseNotificationsRealtime(sb), clients: new SupabaseClientsRepository(sb), security, qhubLink,
    queues: new QueueRepositoryImpl(transport),
    tickets: new TicketRepositoryImpl(transport),
    notifications: new NotificationRepositoryImpl(transport),
    realtime: new RealtimeRepositoryImpl({ wsBaseUrl: env.wsBaseUrl, context }),
    health: new HealthRepositoryImpl(transport),
    session: new AppSession(staff, new ConnectToQhub(auth, context, tokenStore, qhubLink, new DeviceCredentialVault()), context, security, qhubLink),
  };
}

const Ctx = createContext<Container | null>(null);
export const ContainerProvider = ({ value, children }: { value: Container; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;

export function useContainer(): Container {
  const c = useContext(Ctx);
  if (!c) throw new Error('ContainerProvider ausente');
  return c;
}

export function useSession(): SessionSnapshot & { session: AppSession } {
  const { session } = useContainer();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return { ...snap, session };
}
