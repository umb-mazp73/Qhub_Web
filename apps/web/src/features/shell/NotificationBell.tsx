import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/app/container';
import { routeAllowed } from '@/features/staff';
import { Icon } from '@/shared/ui';
import { NoticeRow } from '@/features/notifications/NoticeRow';
import { useNotices } from '@/features/notifications/useNotices';
import type { StaffNotice } from '@/features/notifications/notifications';

/** Campana de la cabecera: contador de no leídos y los avisos más recientes. */
export function NotificationBell() {
  const nav = useNavigate();
  const role = useSession().session.membership?.role;
  const n = useNotices({ limit: 6 });
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', out); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', key); };
  }, [open]);

  const go = (x: StaffNotice) => { void n.markRead(x); setOpen(false); nav(x.route && routeAllowed(role, x.route) ? x.route : '/notificaciones'); };
  const items = n.list.data ?? [];
  return (
    <span ref={root} className="relative print:hidden">
      <button type="button" aria-label={n.unread > 0 ? `Avisos: ${n.unread} sin leer` : 'Avisos'} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="relative inline-flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-inherit hover:bg-sidebar-hover">
        <Icon name="bell" size={20} />
        {n.unread > 0 && <span aria-hidden className="t-label absolute right-1 top-1 min-w-4 rounded-sm bg-brand-mint px-1 text-center text-text-on-accent">{n.unread > 9 ? '9+' : n.unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Avisos" className="fixed inset-x-2 top-12 z-50 bg-layer-01 text-text-primary shadow-overlay sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[400px]">
          <div className="flex items-center justify-between px-4 py-3"><h2 className="t-h4">Avisos</h2>
            {n.unread > 0 && <button type="button" onClick={() => void n.markAll()} className="cursor-pointer border-0 bg-transparent text-link">Marcar todo como leído</button>}</div>
          {n.list.isLoading ? <p className="px-4 pb-4 text-text-secondary">Cargando…</p> : n.list.isError ? <p className="px-4 pb-4 text-support-error">No pudimos cargar los avisos.</p>
            : items.length === 0 ? <p className="border-t border-border-subtle px-4 py-6 text-text-secondary">Sin avisos por ahora. Aquí verás quién se une al equipo y a tu organización.</p>
            : <ul className="m-0 max-h-[60vh] list-none overflow-auto border-t border-border-subtle p-0">{items.map((x) => <NoticeRow key={x.id} notice={x} compact onOpen={go} />)}</ul>}
          <button type="button" onClick={() => { setOpen(false); nav('/notificaciones'); }} className="flex min-h-control-md w-full cursor-pointer items-center justify-between border-0 border-t border-border-subtle bg-transparent px-4 text-link hover:bg-layer-hover">Ver todos los avisos<Icon name="arrow-right" /></button>
        </div>
      )}
    </span>
  );
}
