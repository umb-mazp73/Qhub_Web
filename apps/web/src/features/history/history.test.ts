import { describe, expect, it } from 'vitest';
import { noShowRate } from '@/features/clients/clients';
import { computeStats, loadHistory, ticketsToCsv } from '@/features/history/history';
import { FakeTicketRepository, makeTicket } from '@/testing/fakes';
import { formatDuration, formatPercent } from '@qhub/core';

describe('historial', () => {
  const t0 = new Date('2026-10-20T09:00:00Z');
  const min = (m: number) => new Date(t0.getTime() + m * 60_000);
  const tickets = [
    makeTicket('a', 1, 'finalizado', { createdAt: t0, calledAt: min(6), finishedAt: min(10) }),
    makeTicket('b', 2, 'finalizado', { createdAt: t0, calledAt: min(8), finishedAt: min(14) }),
    makeTicket('c', 3, 'no_show', { createdAt: t0 }), makeTicket('d', 4, 'cancelado', { createdAt: t0 }), makeTicket('e', 5, 'en_espera', { createdAt: t0 }),
  ];
  it('estadísticas', () => {
    const s = computeStats(tickets);
    expect(s).toMatchObject({ total: 5, attended: 2, noShow: 1, cancelled: 1, waiting: 1, avgWaitMs: 7 * 60_000, avgServiceMs: 5 * 60_000 });
    expect(s.noShowRate).toBeCloseTo(1 / 3);
  });
  it('sin datos y formatos', () => {
    const s = computeStats([]);
    expect(s.avgWaitMs).toBeNull(); expect(s.noShowRate).toBe(0);
    expect(formatDuration(null)).toBe('—'); expect(formatDuration(432_000)).toBe('7:12'); expect(formatPercent(0.042)).toBe('4,2 %');
  });
  it('la espera de un turno reservado se mide desde su franja', () => {
    const slot = new Date('2026-10-20T15:00:00Z');
    expect(computeStats([makeTicket('s', 9, 'finalizado', { scheduled: true, slotStart: slot, createdAt: new Date('2026-10-18T00:00:00Z'), calledAt: new Date(slot.getTime() + 180_000), finishedAt: new Date(slot.getTime() + 480_000) })]).avgWaitMs).toBe(180_000);
  });
  it('CSV con escape y prefijo', () => {
    const lines = ticketsToCsv([makeTicket('a', 7, 'no_show', { createdAt: t0 })], { q1: 'Caja, "1"' }, { q1: 'C' }).trim().split('\n');
    expect(lines[0]).toMatch(/^turno,cola/);
    expect(lines[1]).toMatch(/^C-007,"Caja, ""1""",cli-7/);
    expect(lines[1]).toContain('no_show');
  });
  it('loadHistory pagina y recorre los días', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => makeTicket(`t${i}`, i, 'finalizado'));
    const repo = new FakeTicketRepository(many);
    const res = await loadHistory(repo, { days: 2, today: new Date(2026, 9, 20) });
    expect(res.ok && res.value.length).toBe(3000);
    expect(repo.filters).toHaveLength(4);
    expect(repo.filters[2]!.date).toEqual(new Date(2026, 9, 19));
  });
});
