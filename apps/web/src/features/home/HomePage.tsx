import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { firstNameOf, unwrap, friendlyError } from '@qhub/core';
import type { IconName } from '@qhub/design';
import { cx, Button, EmptyState, Icon, LiveIndicator, Notice, Panel, Skeleton } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { useQueues, usePrefixes } from '@/features/queues/hooks';
import { useRefreshInterval } from '@/features/preferences/hooks';
import { useNotices } from '@/features/notifications/useNotices';
import { can, isProfileComplete, ORG_ROLE_LABEL } from '@/features/staff';
import { computeStats } from '@/features/history/history';
import { todayOnly } from '@/features/dashboard/dashboard';
import { NAV } from '@/features/shell/nav';
import { loadRecentPages, recentNavItems } from '@/features/shell/recent-pages';
import { defaultQueuePrefix } from '@qhub/core';
import type { Queue } from '@qhub/api-client';
import { greeting, setupSteps, summaryLine } from './home';
import { HomeHero } from './HomeHero';

const DESCRIPTION: Record<string, string> = {
  '/dashboard': 'Indicadores, gráficas, tablas y reportes en CSV o PDF.', '/colas': 'Crea y edita colas, horarios y franjas.', '/en-vivo': 'Llama, finaliza y marca no-show en tiempo real.',
  '/historial': 'Turnos por fecha, métricas y exportación.', '/clientes': 'Las personas de la app móvil que usan tu cuenta.', '/equipo': 'Integrantes, roles e invitaciones.', '/ajustes': 'Datos de tu cuenta y publicación en la app móvil.',
  '/notificaciones': 'Quién se une y quién se vincula a tu cuenta.', '/perfil': 'Tus datos, seguridad y preferencias.',
};

interface Tile { to: string; label: string; icon: IconName; text: string; badge?: string }

/** Inicio: accesos a la mano. El análisis (gráficas, tablas, CSV y PDF) vive en el Dashboard. */
export function HomePage() {
  const { staff, security } = useContainer();
  const { session } = useSession();
  const nav = useNavigate();
  const m = session.membership!;
  const role = m.role;
  const personal = m.organization.kind === 'persona';
  const now = useMemo(() => new Date(), []);
  const queues = useQueues();
  const prefixes = usePrefixes().data ?? {};
  const unread = useNotices({ limit: 1, enabled: can(role, 'notifications.view') }).unread;
  const profile = useQuery({ queryKey: ['profile'], queryFn: async () => unwrap(await staff.profile()) });
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: async () => unwrap(await security.mfaFactors()) });
  const members = useQuery({ queryKey: ['members', m.organization.id], enabled: can(role, 'team.view'), queryFn: async () => unwrap(await staff.members(m.organization.id)) });
  const { tickets } = useContainer();
  const every = useRefreshInterval();
  const todayStats = useQuery({
    queryKey: ['home-today'], enabled: can(role, 'history.view'), refetchInterval: every === false ? false : Math.max(every, 30_000),
    queryFn: async () => { const r = unwrap(await tickets.list({ date: new Date(), limit: 1000, offset: 0 })); return computeStats(todayOnly(r, new Date())); },
  });
  const active = (queues.data ?? []).filter((q) => q.active);

  const tiles: Tile[] = NAV.filter((n) => n.to !== '/inicio' && can(role, n.needs)).map((n) => ({
    to: n.to, label: n.to === '/notificaciones' ? 'Avisos' : n.label, icon: n.icon, text: DESCRIPTION[n.to] ?? '',
    badge: n.to === '/notificaciones' && unread > 0 ? `${unread} sin leer` : n.to === '/en-vivo' && active.length > 0 ? `${active.length} ${active.length === 1 ? 'cola' : 'colas'}` : undefined,
  }));
  const recents = recentNavItems(loadRecentPages(), (n) => can(role, n.needs) && n.to !== '/inicio');

  const steps = setupSteps({
    admin: can(role, 'settings.manage'), personal, profileComplete: !!profile.data && isProfileComplete(profile.data), mfaEnabled: (factors.data ?? []).some((f) => f.verified),
    orgLocated: !!(m.organization.city && m.organization.country), hasQueues: (queues.data?.length ?? 0) > 0, published: m.organization.published, teamSize: members.data?.length ?? 0,
  });
  const ready = !profile.isLoading && !factors.isLoading && (!can(role, 'settings.manage') || (!queues.isLoading && (!can(role, 'team.view') || !members.isLoading)));
  const pending = steps.filter((s) => !s.done);

  return (
    <div>
      <HomeHero breadcrumb={`${m.organization.name} · ${personal ? 'Cuenta personal' : ORG_ROLE_LABEL[role]}`} title={`${greeting(now)}, ${firstNameOf(session.user?.displayName, session.user?.email)}`}
        date={now.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, (c) => c.toUpperCase())}
        summary={summaryLine(can(role, 'history.view'), todayStats.isLoading, todayStats.data ?? computeStats([]), active.length)}
        actions={<>
          {can(role, 'queues.manage') && !queues.isLoading && active.length === 0 && <Button kind="accent" icon="plus" onClick={() => nav('/colas/nueva')}>Crear mi primera cola</Button>}
          {can(role, 'live.view') && <Button kind={active.length === 0 && can(role, 'queues.manage') ? 'secondary' : 'accent'} icon="live" onClick={() => nav('/en-vivo')}>Ir a la fila</Button>}
          {can(role, 'analytics.view') && <Button kind="secondary" icon="arrow-right" onClick={() => nav('/dashboard')}>Ver el dashboard</Button>}
        </>} />

      <div className="flex flex-col gap-4">
        <section aria-label="Accesos rápidos">
          <h2 className="t-h3 mb-3">Accesos rápidos</h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-px bg-border-subtle p-0 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((t) => (
              <li key={t.to} className="bg-layer-01">
                <Link to={t.to} className="flex h-full min-h-[96px] items-start gap-4 p-5 text-text-primary no-underline hover:bg-layer-hover">
                  <span className="mt-0.5 text-link"><Icon name={t.icon} size={24} /></span>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="t-h4">{t.label}</span>{t.badge && <span className="t-label bg-interactive px-1.5 text-text-on-color">{t.badge}</span>}</span>
                    <span className="t-caption block text-text-secondary">{t.text}</span></span>
                  <span aria-hidden className="text-text-secondary"><Icon name="arrow-right" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {recents.length > 0 && (
          <section aria-label="Visitaste hace poco">
            <h2 className="t-h4 mb-2 text-text-secondary">Visitaste hace poco</h2>
            <div className="flex flex-wrap gap-2">{recents.map((n) => <Link key={n.to} to={n.to} className="inline-flex min-h-control-md items-center gap-2 border border-border-subtle bg-layer-01 px-4 text-text-primary no-underline hover:bg-layer-hover"><Icon name={n.icon} />{n.label}</Link>)}</div>
          </section>
        )}

        {ready && pending.length > 0 && (
          <Panel title={`Termina de configurar · ${steps.length - pending.length} de ${steps.length}`}>
            <div className="mb-4 h-2 w-full bg-skeleton-bg" role="progressbar" aria-label="Progreso de configuración" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={steps.length - pending.length}>
              <div className="h-full bg-brand-mint" style={{ width: `${((steps.length - pending.length) / steps.length) * 100}%` }} />
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {steps.map((s) => (
                <li key={s.id} className="flex min-h-control-lg flex-wrap items-center gap-3 border-t border-border-subtle py-2 first:border-t-0">
                  <span className={s.done ? 'text-state-done-text' : 'text-text-secondary'}><Icon name={s.done ? 'check' : 'clock'} /></span>
                  <span className="min-w-0 flex-1"><span className={s.done ? 'text-text-secondary line-through' : ''}>{s.label}</span>{!s.done && <span className="t-caption block text-text-secondary">{s.hint}</span>}</span>
                  {!s.done ? <Link to={s.to}>Hacerlo</Link> : <span className="t-caption text-text-secondary">Listo</span>}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title="Colas ahora" trailing={<LiveIndicator label="En vivo" />}>
          {queues.isLoading ? <Skeleton height={120} /> : queues.isError ? <Notice kind="error" title={friendlyError(queues.error)} /> : active.length === 0 ? (
            <EmptyState title="No hay colas activas" message={can(role, 'queues.manage') ? 'Crea una cola para empezar a recibir turnos.' : 'Cuando un administrador cree una cola, aparecerá aquí.'}
              action={can(role, 'queues.manage') ? <Button icon="plus" onClick={() => nav('/colas/nueva')}>Crear cola</Button> : undefined} />
          ) : (
            <ul className="m-0 list-none p-0">{active.map((q) => <QueueRow key={q.id} queue={q} prefix={prefixes[q.id] ?? defaultQueuePrefix(q.name)} />)}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function QueueRow({ queue, prefix }: { queue: Queue; prefix: string }) {
  const { queues } = useContainer();
  const refetchInterval = useRefreshInterval();
  const state = useQuery({ queryKey: ['queue-state', queue.id], refetchInterval, queryFn: async () => unwrap(await queues.state(queue.id)) });
  return (
    <li className={cx('flex min-h-row flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle py-2 first:border-t-0')}>
      <span className="t-turn w-12 text-text-secondary">{prefix}</span>
      <Link to={`/en-vivo?cola=${queue.id}`} className="min-w-0 flex-1 truncate">{queue.name}</Link>
      <span className="font-mono text-state-waiting-text" title="En espera">{state.data?.waiting ?? '–'} en espera</span>
      <span className="font-mono text-state-serving-text" title="Atendiendo">{state.data?.serving ?? '–'} atendiendo</span>
    </li>
  );
}
