import { describe, expect, it } from 'vitest';
import {
  delta, deltaText, inPeriod, newClientsPerDay, perQueue, pointsToTable, previousPeriod, queueRowsToTable, reportToCsv, seriesPerDay, statusRows, statusToTable, tableToCsv, ticketsPerHour, todayOnly, waitPerDay,
} from './dashboard';
import { computeStats } from '@/features/history/history';

const t = (queueId: string, h: number, status: 'finalizado' | 'no_show' | 'en_espera' = 'finalizado', day = 17) => ({ id: `${queueId}${day}${h}${status}`, queueId, ownerName: '', userId: 'u', slotStart: new Date(2026, 9, day, h), scheduled: false, number: h, status, position: 0, createdAt: new Date(2026, 9, day, h, 0), calledAt: status === 'en_espera' ? null : new Date(2026, 9, day, h, 5), finishedAt: status === 'finalizado' ? new Date(2026, 9, day, h, 15) : null, agentId: null });
const now = new Date(2026, 9, 17, 10, 30);      // sábado 17 de octubre de 2026

describe('periodos', () => {
  const all = [t('q1', 9), t('q1', 11), t('q1', 9, 'finalizado', 16), t('q1', 9, 'finalizado', 11), t('q1', 9, 'finalizado', 10), t('q1', 9, 'finalizado', 1)];
  it('inPeriod cuenta desde el inicio del primer día hasta hoy, y previousPeriod los días anteriores', () => {
    expect(inPeriod(all, now, 1)).toHaveLength(2);                 // solo hoy
    expect(inPeriod(all, now, 7)).toHaveLength(4);                 // 11–17 oct
    expect(previousPeriod(all, now, 1)).toHaveLength(1);           // ayer
    expect(previousPeriod(all, now, 7)).toHaveLength(1);           // 4–10 oct
    expect(todayOnly(all, now)).toHaveLength(2);
  });
  it('delta y su texto siempre llevan palabra, no solo signo', () => {
    expect(delta(12, 10)).toEqual({ diff: 2, pct: 0.2, direction: 'up' }); expect(delta(5, 0).pct).toBeNull(); expect(delta(3, 3).direction).toBe('flat');
    expect(deltaText(delta(12, 10), 'ayer')).toBe('Sube 2 (+20,0 %) vs ayer'); expect(deltaText(delta(8, 10), 'ayer')).toBe('Baja 2 (−20,0 %) vs ayer');
    expect(deltaText(delta(4, 0), 'ayer')).toBe('Sube 4 vs ayer'); expect(deltaText(delta(3, 3), 'ayer')).toBe('Igual que ayer');
  });
});

describe('series de las gráficas', () => {
  it('turnos por día: etiqueta de día hasta 7 y fecha desde 8; hoy resaltado', () => {
    const week = seriesPerDay([t('q1', 9), t('q1', 9, 'finalizado', 16)], now, 7);
    expect(week).toHaveLength(7); expect(week.at(-1)).toMatchObject({ label: 'sáb', value: 1, highlight: true }); expect(week.at(-2)!.value).toBe(1);
    const month = seriesPerDay([], now, 30);
    expect(month).toHaveLength(30); expect(month.at(-1)!.label).toBe('17/10'); expect(month[0]!.label).toBe('18/9');
  });
  it('turnos por hora cubre 8–17 como mínimo y amplía si hay más', () => {
    const hours = ticketsPerHour([t('q1', 9), t('q1', 9), t('q1', 20)], now);
    expect(hours[0]!.label).toBe('08'); expect(hours.at(-1)!.label).toBe('20'); expect(hours.find((x) => x.label === '09')!.value).toBe(2); expect(hours.find((x) => x.label === '10')!.highlight).toBe(true);
  });
  it('espera promedio por día en minutos con un decimal (0 si no hubo atendidos)', () => {
    const w = waitPerDay([t('q1', 9)], now, 3);                    // llamado 5 min después de la hora del turno
    expect(w.map((p) => p.value)).toEqual([0, 0, 5]);
  });
  it('estado de los turnos con porcentajes (0 si no hay turnos)', () => {
    const s = statusRows(computeStats([t('q1', 9), t('q1', 10, 'no_show'), t('q1', 11, 'en_espera'), t('q1', 12)]));
    expect(s.find((r) => r.label === 'Finalizado')).toMatchObject({ value: 2, pct: 0.5 }); expect(statusRows(computeStats([])).every((r) => r.pct === 0)).toBe(true);
  });
  it('clientes nuevos por día', () => {
    const p = newClientsPerDay([new Date(2026, 9, 17, 8), new Date(2026, 9, 16), null, new Date(2026, 0, 1)], now, 7);
    expect(p.at(-1)!.value).toBe(1); expect(p.at(-2)!.value).toBe(1); expect(p.reduce((a, x) => a + x.value, 0)).toBe(2);
  });
});

describe('tablas y reportes', () => {
  const tickets = [t('q1', 9), t('q1', 10, 'no_show'), t('q2', 11, 'en_espera')];
  it('resumen por cola', () => {
    const rows = perQueue(tickets, { q1: 'Caja 1', q2: 'Cliente' });
    expect(rows[0]).toMatchObject({ name: 'Caja 1', total: 2, served: 1, noShow: 1 }); expect(rows[1]).toMatchObject({ name: 'Cliente', waiting: 1 });
    expect(queueRowsToTable(rows).columns).toHaveLength(6); expect(queueRowsToTable(rows).rows[0]![0]).toBe('Caja 1');
  });
  it('cada gráfica tiene su tabla y su CSV', () => {
    const table = pointsToTable([{ label: 'lun', value: 3 }, { label: 'mar', value: 0 }], 'Día', 'Turnos');
    expect(table).toEqual({ columns: ['Día', 'Turnos'], rows: [['lun', 3], ['mar', 0]] });
    expect(tableToCsv(table)).toBe('Día,Turnos\nlun,3\nmar,0\n');
    expect(statusToTable(statusRows(computeStats(tickets))).rows[0]).toEqual(['Finalizado', 1, '33,3 %']);
  });
  it('reporte completo: encabezado, resumen con periodo anterior y una sección por gráfica', () => {
    const stats = computeStats(tickets);
    const csv = reportToCsv({ organization: 'Notaría, 12', periodLabel: '7 días', now, stats, previous: computeStats([t('q1', 9, 'finalizado', 10)]),
      sections: [{ title: 'Turnos por día', table: pointsToTable(seriesPerDay(tickets, now, 3), 'Día', 'Turnos') }] });
    expect(csv).toContain('Reporte,"Notaría, 12"'); expect(csv).toContain('Periodo,7 días'); expect(csv).toContain('Resumen,valor,periodo anterior');
    expect(csv).toContain('Turnos,3,1'); expect(csv).toContain('Turnos por día'); expect(csv).toContain('Día,Turnos'); expect(csv.endsWith('\n')).toBe(true);
    expect(reportToCsv({ organization: 'x', periodLabel: 'Hoy', now, stats, previous: null, sections: [] })).toContain('Turnos,3,');
  });
});
