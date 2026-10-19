import { describe, expect, it } from 'vitest';
import { loadRecentPages, pushRecentPage, recentNavItems } from './recent-pages';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('páginas recientes', () => {
  it('guarda la más reciente primero, sin repetir, y solo páginas del menú', () => {
    const s = memory();
    pushRecentPage('/colas', s); pushRecentPage('/en-vivo?cola=q1', s); pushRecentPage('/colas/nueva', s); pushRecentPage('/ruta-rara', s);
    expect(loadRecentPages(s)).toEqual(['/colas', '/en-vivo']);      // /colas/nueva cuenta como /colas y sube; lo desconocido se ignora
  });
  it('máximo 6 y tolera datos dañados', () => {
    const s = memory();
    for (const p of ['/inicio', '/dashboard', '/colas', '/en-vivo', '/historial', '/clientes', '/equipo']) pushRecentPage(p, s);
    expect(loadRecentPages(s)).toHaveLength(6); expect(loadRecentPages(s)[0]).toBe('/equipo');
    s.setItem('qhub.recent.pages', '{no'); expect(loadRecentPages(s)).toEqual([]);
  });
  it('filtra por lo que el rol puede ver', () => {
    expect(recentNavItems(['/clientes', '/colas'], (n) => n.to !== '/clientes').map((n) => n.to)).toEqual(['/colas']);
  });
});
