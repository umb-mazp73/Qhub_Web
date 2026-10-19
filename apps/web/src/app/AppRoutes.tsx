import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './container';
import { resolveRedirect } from './resolve-redirect';
import { LoginPage } from '@/features/auth/LoginPage';
const SetupPage = lazy(() => import('@/features/auth/SetupPage').then((m) => ({ default: m.SetupPage })));
const ConnectPage = lazy(() => import('@/features/qhub/ConnectPage').then((m) => ({ default: m.ConnectPage })));
const AppShell = lazy(() => import('@/features/shell/AppShell').then((m) => ({ default: m.AppShell })));
const QueuesPage = lazy(() => import('@/features/queues/QueuesPage').then((m) => ({ default: m.QueuesPage })));
const QueueEditPage = lazy(() => import('@/features/queues/QueueEditPage').then((m) => ({ default: m.QueueEditPage })));
const LivePage = lazy(() => import('@/features/live/LivePage').then((m) => ({ default: m.LivePage })));
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const TeamPage = lazy(() => import('@/features/team/TeamPage').then((m) => ({ default: m.TeamPage })));
const HomePage = lazy(() => import('@/features/home/HomePage').then((m) => ({ default: m.HomePage })));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const ClientsPage = lazy(() => import('@/features/clients/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const MfaChallengePage = lazy(() => import('@/features/auth/MfaChallengePage').then((m) => ({ default: m.MfaChallengePage })));
const NotFoundPage = lazy(() => import('@/features/shell/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
import { Logo } from '@/shared/ui';
import { pendingInvitation, rememberInvitation } from '@/features/invitation/pending-invitation';
const InvitationPage = lazy(() => import('@/features/invitation/InvitationPage').then((m) => ({ default: m.InvitationPage })));

function Gate() {
  const { auth, memberships, connection, session, mfa } = useSession();
  const { pathname, search } = useLocation();
  if (pathname === '/invitacion') rememberInvitation(new URLSearchParams(search).get('token'));    // sobrevive al inicio de sesión
  const signedIn = auth.status === 'ready' && auth.value !== null;
  // Mientras se conecta sola con la conexión guardada (fuera de la pantalla de conectar) se muestra la carga, no se pide nada.
  const autoConnecting = connection.status === 'connecting' && !!connection.auto && pathname !== '/connect';
  const loading = auth.status === 'loading' || (signedIn && (mfa === 'checking' || (mfa === 'ok' && (memberships.status === 'loading' || autoConnecting))));
  const target = resolveRedirect({
    location: pathname,
    authLoading: auth.status === 'loading',
    signedIn,
    membershipsLoading: memberships.status === 'loading',
    hasOrganization: session.membership !== null,
    role: session.membership?.role ?? null,
    // Con la conexión ya confirmada (registro en la base de datos) no se muestra la pantalla de conectar, aunque falte el token:
    // la app abre y avisa dentro de la pantalla (ver ReconnectBanner).
    connected: connection.status === 'connected' || !!session.membership?.organization.qhubConnected,
    mfa,
    pendingInvitation: pendingInvitation() !== null,
  });
  if (loading) return <Splash />;
  return target ? <Navigate to={target} replace /> : <Suspense fallback={<Splash />}><Outlet /></Suspense>;
}

function Splash() { return <div role="status" aria-label="Cargando" className="grid h-full place-items-center"><Logo height={32} /></div>; }

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Gate />}>
        <Route path="/cargando" element={<Splash />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/connect" element={<ConnectPage />} />
        <Route path="/invitacion" element={<InvitationPage />} />
        <Route path="/restablecer" element={<ResetPasswordPage />} />
        <Route path="/verificacion" element={<MfaChallengePage />} />
        <Route element={<AppShell />}>
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/colas" element={<QueuesPage />} />
          <Route path="/colas/nueva" element={<QueueEditPage />} />
          <Route path="/colas/:id" element={<QueueEditPage />} />
          <Route path="/en-vivo" element={<LivePage />} />
          <Route path="/historial" element={<HistoryPage />} />
          <Route path="/equipo" element={<TeamPage />} />
          <Route path="/clientes" element={<ClientsPage />} />
          <Route path="/notificaciones" element={<NotificationsPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
