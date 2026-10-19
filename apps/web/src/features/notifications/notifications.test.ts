import { describe, expect, it } from 'vitest';
import { groupByDay } from '@/features/notifications/notifications';

describe('avisos (dominio)', () => {
  const n = (id: string, createdAt: Date) => ({ id, kind: 'cliente' as const, title: 't', message: 'm', route: null, read: false, createdAt });
  it('agrupa por día', () => {
    const now = new Date(2026, 9, 17, 12);
    const g = groupByDay([n('a', new Date(2026, 9, 17, 8)), n('b', new Date(2026, 9, 16, 8)), n('c', new Date(2026, 9, 1))], now);
    expect(g.map((x) => x.label)).toEqual(['Hoy', 'Ayer', 'Anteriores']);
  });
});
