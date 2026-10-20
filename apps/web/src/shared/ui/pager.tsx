import { useState } from 'react';
import { IconButton } from './controls';

/** Paginación en el cliente sobre una lista ya cargada. `resetKey` cambia (un filtro, una pestaña) → vuelve a la primera página. */
export function usePaged<T>(items: readonly T[], size: number, resetKey: unknown = null) {
  const [state, setState] = useState<{ page: number; key: unknown }>({ page: 0, key: resetKey });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const wanted = Object.is(state.key, resetKey) ? state.page : 0;
  const page = Math.min(wanted, pages - 1);
  const rows = items.slice(page * size, page * size + size);
  return { rows, page, pages, total: items.length, from: items.length === 0 ? 0 : page * size + 1, to: page * size + rows.length, setPage: (p: number) => setState({ page: p, key: resetKey }) };
}

/** Pie de paginación: «1–10 de 34 avisos · Página 1 de 4» con anterior / siguiente. No se muestra si todo cabe en una página. */
export function Pager({ paged, noun, className = '' }: { paged: Pick<ReturnType<typeof usePaged>, 'page' | 'pages' | 'total' | 'from' | 'to' | 'setPage'>; noun: string; className?: string }) {
  const { page, pages, total, from, to, setPage } = paged;
  if (pages <= 1) return null;
  return (
    <nav aria-label={`Paginación de ${noun}`} className={`flex min-h-row flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-2 ${className}`}>
      <span className="t-caption flex-1 text-text-secondary">{from}–{to} de {total} {noun}</span>
      <span className="t-caption text-text-secondary">Página {page + 1} de {pages}</span>
      <IconButton icon="chevron-left" label="Anterior" disabled={page === 0} onClick={() => setPage(page - 1)} />
      <IconButton icon="chevron-right" label="Siguiente" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} />
    </nav>
  );
}
