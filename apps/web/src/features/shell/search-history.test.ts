import { describe, expect, it } from 'vitest';
import { clearSearchHistory, loadSearchHistory, pushSearch } from './search-history';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('historial de búsqueda', () => {
  it('guarda lo último primero, sin repetir (sin importar mayúsculas) y ignora lo muy corto', () => {
    const s = memory();
    pushSearch('caja', s); pushSearch('  Equipo   nuevo ', s); pushSearch('CAJA', s); pushSearch('a', s);
    expect(loadSearchHistory(s)).toEqual(['CAJA', 'Equipo nuevo']);
  });
  it('máximo 6, se puede borrar y tolera datos dañados', () => {
    const s = memory();
    for (const t of ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete']) pushSearch(t, s);
    expect(loadSearchHistory(s)).toHaveLength(6); expect(loadSearchHistory(s)[0]).toBe('siete');
    clearSearchHistory(s); expect(loadSearchHistory(s)).toEqual([]);
    s.setItem('qhub.search.history', '{no'); expect(loadSearchHistory(s)).toEqual([]);
  });
});
