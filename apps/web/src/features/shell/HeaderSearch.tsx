import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@qhub/core';
import type { IconName } from '@qhub/design';
import { cx, Icon } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { useQueues } from '@/features/queues/hooks';
import { can } from '@/features/staff';
import { NAV } from './nav';
import { loadRecentPages, recentNavItems } from './recent-pages';
import { clearSearchHistory, loadSearchHistory, pushSearch } from './search-history';

type Group = 'Páginas' | 'Colas' | 'Equipo';
interface Hit { id: string; group: Group; label: string; hint?: string; icon: IconName; to: string }
/** Elemento navegable con teclado cuando el campo está vacío: una búsqueda anterior o una página reciente. */
type Idle = { id: string; kind: 'history'; label: string } | { id: string; kind: 'page'; label: string; icon: IconName; to: string };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Búsqueda global (Ctrl K o `/`). Vacía muestra el historial y los accesos recientes; al escribir, páginas, colas y personas según el rol. */
export function HeaderSearch() {
  const nav = useNavigate();
  const { staff } = useContainer();
  const { session } = useSession();
  const role = session.membership?.role;
  const orgId = session.membership?.organization.id;
  const queues = useQueues();
  const members = useQuery({ queryKey: ['members', orgId], enabled: !!orgId && can(role, 'team.view'), queryFn: async () => unwrap(await staff.members(orgId!)) });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [active, setActive] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  const all = useMemo<Hit[]>(() => {
    const pages = NAV.filter((n) => can(role, n.needs)).map((n): Hit => ({ id: `p-${n.to}`, group: 'Páginas', label: n.label, hint: n.keywords, icon: n.icon, to: n.to }));
    if (can(role, 'queues.manage')) pages.push({ id: 'p-nueva', group: 'Páginas', label: 'Crear cola', hint: 'nueva agregar', icon: 'plus', to: '/colas/nueva' });
    const qs = (queues.data ?? []).filter((x) => x.active).map((x): Hit => ({ id: `q-${x.id}`, group: 'Colas', label: x.name, hint: x.description ?? undefined, icon: 'queue', to: `/en-vivo?cola=${x.id}` }));
    const ms = (members.data ?? []).map((m): Hit => ({ id: `m-${m.userId}`, group: 'Equipo', label: m.name, icon: 'user', to: '/equipo' }));
    return [...pages, ...qs, ...ms];
  }, [role, queues.data, members.data]);

  const term = norm(q.trim());
  const hits = useMemo(() => (term ? all.filter((h) => norm(`${h.label} ${h.hint ?? ''}`).includes(term)).slice(0, 8) : []), [all, term]);
  const idle = useMemo<Idle[]>(() => {
    const allowed = (n: (typeof NAV)[number]) => can(role, n.needs) && n.to !== '/perfil';
    let tiles = recentNavItems(recents, allowed);
    if (tiles.length < 4) tiles = [...tiles, ...NAV.filter((n) => allowed(n) && !tiles.some((t) => t.to === n.to))].slice(0, 6);   // sin historial aún: accesos habituales
    return [...history.map((h): Idle => ({ id: `h-${h}`, kind: 'history', label: h })), ...tiles.map((n): Idle => ({ id: `r-${n.to}`, kind: 'page', label: n.label, icon: n.icon, to: n.to }))];
  }, [history, recents, role]);
  const items = term ? hits : idle;

  const openPanel = () => { setHistory(loadSearchHistory()); setRecents(loadRecentPages()); setActive(0); setOpen(true); };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? '') || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setMobile(true); openPanel(); setTimeout(() => input.current?.focus(), 0); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setMobile(false); } };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]);

  const close = () => { setOpen(false); setMobile(false); };
  function go(to: string, saveTerm = q) { pushSearch(saveTerm); close(); setQ(''); nav(to); }
  function choose(i: number) {
    const it = items[i];
    if (!it) return;
    if ('kind' in it) { if (it.kind === 'history') { setQ(it.label); setActive(0); input.current?.focus(); } else go(it.to, ''); }
    else go(it.to, it.label.length >= 2 && q.trim() ? q : it.label);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openPanel(); else setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { close(); input.current?.blur(); }
  }

  const optionId = (i: number) => `${id}-o${i}`;
  let last = '';
  const historyItems = idle.filter((x) => x.kind === 'history');
  const tileItems = idle.filter((x) => x.kind === 'page');
  return (
    <div ref={box} className={cx('print:hidden', mobile ? 'absolute inset-x-0 top-0 z-50 flex h-header items-center bg-sidebar-bg px-2' : 'justify-self-end sm:justify-self-stretch')}>
      <button type="button" aria-label="Buscar" onClick={() => { setMobile(true); openPanel(); setTimeout(() => input.current?.focus(), 0); }}
        className={cx('inline-flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-inherit hover:bg-sidebar-hover sm:hidden', mobile && 'hidden')}><Icon name="search" size={20} /></button>
      <div className={cx('relative mx-auto w-full max-w-[620px]', !mobile && 'hidden sm:block')}>
        <label htmlFor={id} className="sr-only">Buscar páginas, colas y personas</label>
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"><Icon name="search" /></span>
        <input ref={input} id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-l`} aria-autocomplete="list" aria-activedescendant={open && items[active] ? optionId(active) : undefined}
          autoComplete="off" value={q} placeholder="Buscar páginas, colas y personas (Ctrl K)" onFocus={openPanel} onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onKeyDown={onKey}
          className="h-control-md w-full rounded-sm border border-border-strong bg-layer-01 pl-10 pr-10 text-text-primary outline-none placeholder:text-text-placeholder focus:outline-2 focus:outline-focus" />
        {q && <button type="button" aria-label="Borrar búsqueda" onClick={() => { setQ(''); setActive(0); input.current?.focus(); }} className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center border-0 bg-transparent text-text-secondary hover:bg-layer-hover"><Icon name="close" /></button>}
        {open && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-[75vh] flex-col overflow-auto border border-border-subtle bg-layer-01 text-text-primary shadow-overlay">
            <ul id={`${id}-l`} role="listbox" aria-label="Resultados" className="m-0 list-none p-0">
              {term ? (
                <>
                  {hits.length === 0 && <li className="px-4 py-4 text-text-secondary" role="presentation">Sin resultados para «{q}».</li>}
                  {hits.map((h, i) => {
                    const head = h.group !== last; last = h.group;
                    return (
                      <li key={h.id} role="presentation">
                        {head && <div className="t-label px-4 pb-1 pt-3 uppercase text-text-secondary">{h.group}</div>}
                        <div id={optionId(i)} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} onMouseEnter={() => setActive(i)}
                          className={cx('flex min-h-control-md cursor-pointer items-center gap-3 px-4', i === active && 'bg-layer-hover')}><Icon name={h.icon} /><span className="truncate">{h.label}</span></div>
                      </li>
                    );
                  })}
                </>
              ) : (
                <>
                  {historyItems.length > 0 && (
                    <li role="presentation">
                      <div className="flex items-center justify-between px-4 pb-1 pt-3"><h2 className="t-h4 m-0">Historial de búsqueda</h2>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { clearSearchHistory(); setHistory([]); setActive(0); }}
                          className="min-h-control-sm cursor-pointer border border-link bg-transparent px-3 text-link hover:bg-layer-hover">Borrar todo</button></div>
                      <ul role="presentation" className="m-0 list-none p-0">
                        {historyItems.map((h, i) => (
                          <li key={h.id} role="presentation"><div id={optionId(i)} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} onMouseEnter={() => setActive(i)}
                            className={cx('flex min-h-control-md cursor-pointer items-center gap-3 px-4', i === active && 'bg-layer-hover')}><span className="text-link"><Icon name="history" /></span><span className="truncate">{h.label}</span></div></li>
                        ))}
                      </ul>
                    </li>
                  )}
                  <li role="presentation">
                    <h2 className="t-h4 m-0 px-4 pb-2 pt-4">{recents.length > 0 ? 'Visitaste hace poco' : 'Accesos habituales'}</h2>
                    <ul role="presentation" className="m-0 grid list-none grid-cols-2 gap-1 p-2 pt-0 sm:grid-cols-3">
                      {tileItems.map((t, j) => {
                        const i = historyItems.length + j;
                        return (
                          <li key={t.id} role="presentation"><div id={optionId(i)} role="option" aria-selected={i === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} onMouseEnter={() => setActive(i)}
                            className={cx('flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-2 px-2 text-center', i === active && 'bg-layer-hover')}>
                            <span className="text-link"><Icon name={(t as { icon: IconName }).icon} size={32} /></span><span>{t.label}</span></div></li>
                        );
                      })}
                    </ul>
                  </li>
                </>
              )}
            </ul>
            <div className="t-caption mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border-subtle px-4 py-3 text-text-secondary">
              <span>↑ ↓ moverse · Enter abrir · Esc cerrar</span><span>Atajo: Ctrl K o /</span>
            </div>
          </div>
        )}
      </div>
      {mobile && <button type="button" aria-label="Cerrar búsqueda" onClick={close} className="ml-1 inline-flex size-10 cursor-pointer items-center justify-center border-0 bg-transparent text-inherit sm:hidden"><Icon name="close" size={20} /></button>}
    </div>
  );
}
