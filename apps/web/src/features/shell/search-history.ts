const KEY = 'qhub.search.history';
const MAX = 6;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => { try { return localStorage; } catch { return null; } };

/** Búsquedas hechas antes (la más reciente primero), guardadas solo en este navegador. */
export function loadSearchHistory(s: Store | null = store()): string[] {
  try { const v = JSON.parse(s?.getItem(KEY) ?? '[]') as unknown; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, MAX) : []; } catch { return []; }
}

/** Agrega una búsqueda (mínimo 2 caracteres), sin repetir sin importar mayúsculas. Devuelve la lista nueva. */
export function pushSearch(term: string, s: Store | null = store()): string[] {
  const t = term.trim().replace(/\s+/g, ' ');
  const cur = loadSearchHistory(s);
  if (t.length < 2) return cur;
  const next = [t, ...cur.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
  try { s?.setItem(KEY, JSON.stringify(next)); } catch { /* sin storage */ }
  return next;
}

export function clearSearchHistory(s: Store | null = store()): void { try { s?.setItem(KEY, '[]'); } catch { /* sin storage */ } }
