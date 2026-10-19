import { NAV, type NavItem } from './nav';

const KEY = 'qhub.recent.pages';
const MAX = 6;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return localStorage; } catch { return null; } };

/** Rutas visitadas hace poco (la más reciente primero), guardadas en este navegador. */
export function loadRecentPages(s: Store | null = store()): string[] {
  try { const v = JSON.parse(s?.getItem(KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX) : []; } catch { return []; }
}

/** Registra una visita. Solo cuentan las páginas del menú (no el detalle ni la edición). Devuelve la lista nueva. */
export function pushRecentPage(path: string, s: Store | null = store()): string[] {
  const item = NAV.find((n) => path === n.to || path.startsWith(`${n.to}/`) || path.startsWith(`${n.to}?`));
  if (!item) return loadRecentPages(s);
  const next = [item.to, ...loadRecentPages(s).filter((p) => p !== item.to)].slice(0, MAX);
  try { s?.setItem(KEY, JSON.stringify(next)); } catch { /* sin storage */ }
  return next;
}

/** Rutas recientes convertidas a entradas del menú, solo las que el rol puede ver. */
export function recentNavItems(paths: readonly string[], allowed: (item: NavItem) => boolean): NavItem[] {
  return paths.map((p) => NAV.find((n) => n.to === p)).filter((n): n is NavItem => !!n && allowed(n));
}
