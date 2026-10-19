import { initialsOf } from '@qhub/core';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, cx, Icon, LiveIndicator, Logo } from '@/shared/ui';
import { useSession } from '@/app/container';
import { can } from '@/features/staff/permissions';
import { ORG_ROLE_LABEL } from '@/features/staff';
import { useNotices } from '@/features/notifications/useNotices';
import { NAV, type NavItem } from './nav';
import { pushRecentPage } from './recent-pages';
import { HeaderSearch } from './HeaderSearch';
import { ReconnectBanner } from '@/features/qhub/ReconnectBanner';
import { NoticePopups } from '@/features/notifications/NoticePopups';
import { QhubNotices } from '@/features/notifications/QhubNotices';
import { NotificationBell } from './NotificationBell';

const GROUPS = { operacion: 'Operación', organizacion: 'Organización', cuenta: 'Cuenta' } as const;
const COLLAPSE_KEY = 'qhub.sidebar';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

/** Cabecera Ink de 48 px + menú lateral Ink (256 px, o 48 px contraído; cajón en pantallas pequeñas) + contenido sobre `background`. */
export function AppShell() {
  const { session } = useSession();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [peek, setPeek] = useState(false);          // menú contraído: al pasar el mouse se abre encima y al salir se cierra solo
  const main = useRef<HTMLElement>(null);
  const m = session.membership;
  const user = session.user;
  const role = m?.role;
  const unread = useNotices({ limit: 1, enabled: can(role, 'notifications.view') }).unread;

  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0'); } catch { /* sin storage */ } return n; });

  // Cada cambio de página: título (con avisos sin leer), foco al contenido y se cierran los menús.
  useEffect(() => {
    const t = NAV.find((n) => pathname.startsWith(n.to))?.label ?? (pathname.startsWith('/colas') ? 'Colas' : null);
    document.title = `${unread > 0 ? `(${unread}) ` : ''}${t ? `${t} · Qhub` : 'Qhub · Administración'}`;
  }, [pathname, unread]);
  useEffect(() => { setDrawer(false); setMenu(false); main.current?.focus({ preventScroll: true }); pushRecentPage(pathname); }, [pathname]);
  useEffect(() => {
    if (!drawer && !menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDrawer(false); setMenu(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer, menu]);

  const link = (n: NavItem, rail: boolean) => can(role, n.needs) && (
    <NavLink key={n.to} to={n.to} title={rail ? n.label : undefined} aria-label={rail ? n.label : undefined}
      className={({ isActive }) => cx('flex min-h-control-md items-center border-l-[3px] no-underline hover:bg-sidebar-hover', rail ? 'justify-center px-0' : 'gap-3 px-4', isActive ? 'border-l-brand-mint bg-sidebar-active text-sidebar-text-active' : 'border-l-transparent text-sidebar-text')}>
      <Icon name={n.icon} />{!rail && n.label}
    </NavLink>
  );
  const sidebar = (rail: boolean) => (
    <>
      {(Object.keys(GROUPS) as Array<keyof typeof GROUPS>).map((g) => {
        const items = NAV.filter((n) => n.group === g && can(role, n.needs));
        if (items.length === 0) return null;
        return (
          <div key={g}>
            {rail ? <div className="mx-3 my-2 border-t border-sidebar-active" /> : <div className="t-label px-4 pb-1 pt-4 uppercase text-sidebar-text opacity-70">{g === 'organizacion' ? (m?.organization.kind === 'persona' ? 'Mi cuenta' : can(role, 'settings.manage') ? 'Organización' : 'Consulta') : GROUPS[g]}</div>}
            {items.map((n) => link(n, rail))}
          </div>
        );
      })}
      <div className={cx('mt-auto', rail ? 'flex flex-col items-center gap-3 py-3' : 'p-4')}>
        {!rail && <LiveIndicator onInk label="Conectado" />}
        {rail && <span title="Conectado" className="size-2 rounded-full bg-brand-mint" />}
      </div>
    </>
  );

  return (
    <div className="grid h-full grid-rows-[var(--header-height)_1fr] print:block print:h-auto">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:bg-layer-01 focus:px-4 focus:py-2">Saltar al contenido</a>
      <header className="relative grid grid-cols-[1fr_auto_auto] items-center gap-1 bg-sidebar-bg px-2 text-sidebar-text-active sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-3 sm:px-3 lg:grid-cols-[1fr_minmax(0,620px)_1fr] print:hidden">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button type="button" aria-label="Abrir menú" aria-expanded={drawer} aria-controls="menu-lateral" onClick={() => setDrawer(true)}
          className="inline-flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-inherit hover:bg-sidebar-hover md:hidden"><Icon name="menu" size={20} /></button>
        <button type="button" aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-expanded={!collapsed} aria-controls="menu-principal" onClick={toggleCollapsed}
          className="hidden size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-inherit hover:bg-sidebar-hover md:inline-flex"><Icon name="menu" size={20} /></button>
        <Link to="/inicio" aria-label="Ir al inicio" className="inline-flex items-center no-underline"><Logo name="qhub-horizontal-negativo" height={22} /></Link>
        <span className="hidden min-w-0 shrink items-center gap-2 text-sidebar-text xl:flex"><Icon name="building" />
          <span className="truncate text-sidebar-text-active">{m?.organization.name}</span>
          {role && <span className="t-caption text-sidebar-text">· {m?.organization.kind === 'persona' ? 'Cuenta personal' : ORG_ROLE_LABEL[role]}</span>}
        </span>
        </div>
        <HeaderSearch />
        <span className="flex items-center justify-end gap-1">
          {can(role, 'notifications.view') && <><NoticePopups /><NotificationBell /></>}
          <span className="relative">
            <button type="button" aria-label="Cuenta" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}
              className="inline-flex cursor-pointer items-center border-0 bg-transparent p-1">{user ? <Avatar size="sm" text={initialsOf(user.displayName, user.email)} /> : null}</button>
            {menu && (
              <>
                <button type="button" tabIndex={-1} aria-hidden className="fixed inset-0 z-30 cursor-default border-0 bg-transparent" onClick={() => setMenu(false)} />
                <div role="menu" className="absolute right-0 top-10 z-40 min-w-[260px] bg-layer-01 text-text-primary shadow-overlay">
                  <div className="px-4 py-3"><div className="truncate">{user?.displayName ?? user?.email}</div><div className="t-caption truncate text-text-secondary">{user?.email}</div>
                    {m && <div className="t-caption mt-1 text-text-secondary">{m.organization.name} · {ORG_ROLE_LABEL[m.role]}</div>}</div>
                  <button type="button" role="menuitem" onClick={() => nav('/perfil')} className="flex min-h-control-md w-full cursor-pointer items-center gap-3 border-0 border-t border-border-subtle bg-transparent px-4 text-left hover:bg-layer-hover"><Icon name="user" />Mi perfil</button>
                  <button type="button" role="menuitem" onClick={() => void session.signOut()} className="flex min-h-control-md w-full cursor-pointer items-center gap-3 border-0 border-t border-border-subtle bg-transparent px-4 text-left hover:bg-layer-hover"><Icon name="logout" />Cerrar sesión</button>
                </div>
              </>
            )}
          </span>
        </span>
      </header>
      <div className={cx('grid min-h-0 grid-cols-1 transition-[grid-template-columns] duration-300 ease-out print:block', collapsed ? 'md:grid-cols-[var(--sidebar-collapsed)_1fr]' : 'md:grid-cols-[var(--sidebar-width)_1fr]')}>
        <div className="relative hidden md:block print:hidden" onMouseEnter={() => setPeek(true)} onMouseLeave={() => setPeek(false)}>
          <nav id="menu-principal" aria-label="Principal" className={cx('absolute inset-y-0 left-0 z-30 flex flex-col overflow-y-auto overflow-x-hidden bg-sidebar-bg pt-2 transition-[width,box-shadow] duration-300 ease-out', collapsed && !peek ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]', collapsed && peek && 'shadow-overlay')}>{sidebar(collapsed && !peek)}</nav>
        </div>
        <main id="contenido" ref={main} tabIndex={-1} className="min-w-0 overflow-auto bg-background p-4 outline-none sm:p-6 md:p-8 print:overflow-visible print:p-0">
          <ReconnectBanner />
          <QhubNotices />
          <Outlet />
        </main>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Cerrar menú" className="absolute inset-0 cursor-default border-0 bg-overlay" onClick={() => setDrawer(false)} />
          <nav id="menu-lateral" aria-label="Principal" className="absolute inset-y-0 left-0 flex w-[min(var(--sidebar-width),85vw)] flex-col overflow-y-auto bg-sidebar-bg pt-2 shadow-overlay">
            <div className="flex items-center justify-between px-4 pb-2"><Link to="/inicio" aria-label="Ir al inicio" className="inline-flex items-center no-underline"><Logo name="qhub-horizontal-negativo" height={22} /></Link>
              <button type="button" aria-label="Cerrar menú" onClick={() => setDrawer(false)} className="inline-flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-sidebar-text-active"><Icon name="close" size={20} /></button></div>
            {sidebar(false)}
          </nav>
        </div>
      )}
    </div>
  );
}
