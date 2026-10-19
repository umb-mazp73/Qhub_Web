import type { Ticket } from '@qhub/api-client';
import { computeStats, type HistoryStats } from '@/features/history/history';
import { formatDuration, formatPercent, toCsv } from '@qhub/core';

const DAY = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const todayOnly = (tickets: readonly Ticket[], now: Date): Ticket[] => tickets.filter((t) => sameDay(t.createdAt, now));

/** Turnos de hoy por hora de llegada (de la primera a la última hora con actividad, mínimo 8–17 h). */
export function ticketsPerHour(tickets: readonly Ticket[], now: Date): Array<{ label: string; value: number; highlight: boolean }> {
  const today = todayOnly(tickets, now);
  const hours = today.map((t) => t.createdAt.getHours());
  const from = Math.min(8, ...hours), to = Math.max(17, ...hours);
  return Array.from({ length: to - from + 1 }, (_, i) => ({ label: String(from + i).padStart(2, '0'), value: today.filter((t) => t.createdAt.getHours() === from + i).length, highlight: from + i === now.getHours() }));
}

export interface QueueRow { queueId: string; name: string; total: number; served: number; noShow: number; waiting: number; avgWaitMs: number | null }
/** Resumen por cola (mismo criterio de espera que `computeStats`). */
export function perQueue(tickets: readonly Ticket[], names: Record<string, string>): QueueRow[] {
  const ids = [...new Set(tickets.map((t) => t.queueId))];
  return ids.map((id) => {
    const own = tickets.filter((t) => t.queueId === id);
    const s = computeStats(own);
    return { queueId: id, name: names[id] ?? 'Cola', total: s.total, served: s.attended, noShow: s.noShow, waiting: s.waiting, avgWaitMs: s.avgWaitMs };
  }).sort((a, b) => b.total - a.total);
}

// ───────── Dashboard: periodos, comparación y series para las gráficas ─────────

export const PERIODS = [{ days: 1, label: 'Hoy' }, { days: 7, label: '7 días' }, { days: 30, label: '30 días' }] as const;
export type PeriodDays = (typeof PERIODS)[number]['days'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Turnos creados en los últimos `days` días (hoy incluido). */
export const inPeriod = (tickets: readonly Ticket[], now: Date, days: number): Ticket[] => {
  const from = addDays(startOfDay(now), -(days - 1)).getTime();
  return tickets.filter((t) => t.createdAt.getTime() >= from && t.createdAt.getTime() < addDays(startOfDay(now), 1).getTime());
};
/** Los `days` días inmediatamente anteriores al periodo actual (para comparar). */
export const previousPeriod = (tickets: readonly Ticket[], now: Date, days: number): Ticket[] => {
  const to = addDays(startOfDay(now), -(days - 1)).getTime();
  const from = addDays(startOfDay(now), -(2 * days - 1)).getTime();
  return tickets.filter((t) => t.createdAt.getTime() >= from && t.createdAt.getTime() < to);
};

export interface Delta { diff: number; pct: number | null; direction: 'up' | 'down' | 'flat' }
/** Diferencia con el periodo anterior. `pct` es null si antes era 0. */
export function delta(current: number, previous: number): Delta {
  const diff = current - previous;
  return { diff, pct: previous === 0 ? null : diff / previous, direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}
/** "▲ +3 (+12,5 %) vs ayer" sin símbolos solos: siempre con palabra. `lowerIsBetter` solo cambia el sentido semántico en la UI. */
export function deltaText(d: Delta, against: string): string {
  if (d.direction === 'flat') return `Igual que ${against}`;
  const sign = d.diff > 0 ? '+' : '−';
  const pct = d.pct === null ? '' : ` (${sign}${formatPercent(Math.abs(d.pct)).replace(' %', '')} %)`;
  return `${d.direction === 'up' ? 'Sube' : 'Baja'} ${Math.abs(d.diff)}${pct} vs ${against}`;
}

export interface ChartPoint { label: string; value: number; highlight?: boolean }
export interface TableData { columns: string[]; rows: Array<Array<string | number>> }

const dm = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
/** Turnos por día del periodo; para "Hoy" no aplica (se usa por hora). Etiqueta: día de la semana si son 7 o menos, fecha si son más. */
export function seriesPerDay(tickets: readonly Ticket[], now: Date, days: number): ChartPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(startOfDay(now), -(days - 1 - i));
    return { label: days <= 7 ? DAY[d.getDay()]! : dm(d), value: tickets.filter((t) => sameDay(t.createdAt, d)).length, highlight: i === days - 1 };
  });
}
/** Espera promedio (minutos, un decimal) por día del periodo. Días sin turnos atendidos valen 0. */
export function waitPerDay(tickets: readonly Ticket[], now: Date, days: number): ChartPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(startOfDay(now), -(days - 1 - i));
    const ms = computeStats(tickets.filter((t) => sameDay(t.createdAt, d))).avgWaitMs;
    return { label: days <= 7 ? DAY[d.getDay()]! : dm(d), value: ms === null ? 0 : Math.round((ms / 60000) * 10) / 10, highlight: i === days - 1 };
  });
}
/** Reparto por estado con porcentaje sobre el total. */
export function statusRows(s: HistoryStats): Array<{ label: string; value: number; pct: number }> {
  const rows = [['Finalizado', s.attended], ['En espera', s.waiting], ['Cancelado', s.cancelled], ['No-show', s.noShow]] as const;
  return rows.map(([label, value]) => ({ label, value, pct: s.total === 0 ? 0 : value / s.total }));
}

export const pointsToTable = (points: readonly ChartPoint[], first: string, second: string): TableData => ({ columns: [first, second], rows: points.map((p) => [p.label, p.value]) });
export const queueRowsToTable = (rows: readonly QueueRow[]): TableData => ({ columns: ['Cola', 'Turnos', 'Atendidos', 'No-show', 'En espera', 'Espera promedio'], rows: rows.map((q) => [q.name, q.total, q.served, q.noShow, q.waiting, formatDuration(q.avgWaitMs)]) });
export const statusToTable = (rows: ReturnType<typeof statusRows>): TableData => ({ columns: ['Estado', 'Turnos', '%'], rows: rows.map((r) => [r.label, r.value, formatPercent(r.pct)]) });

/** Una tabla (de una gráfica) como CSV. */
export const tableToCsv = (t: TableData): string => toCsv([t.columns, ...t.rows]);

/** Reporte completo del Dashboard en CSV: encabezado, resumen del periodo, comparación y una sección por gráfica. */
export function reportToCsv(o: { organization: string; periodLabel: string; now: Date; stats: HistoryStats; previous: HistoryStats | null; sections: ReadonlyArray<{ title: string; table: TableData }> }): string {
  const rows: Array<string | unknown[]> = [['Reporte', o.organization], ['Periodo', o.periodLabel], ['Generado', o.now.toISOString()], '', 'Resumen,valor,periodo anterior'];
  const kv: Array<[string, unknown, unknown]> = [
    ['Turnos', o.stats.total, o.previous?.total], ['Atendidos', o.stats.attended, o.previous?.attended], ['En espera', o.stats.waiting, o.previous?.waiting], ['No-show', o.stats.noShow, o.previous?.noShow],
    ['Cancelados', o.stats.cancelled, o.previous?.cancelled], ['Espera promedio (min:seg)', formatDuration(o.stats.avgWaitMs), o.previous ? formatDuration(o.previous.avgWaitMs) : undefined],
    ['Atención promedio (min:seg)', formatDuration(o.stats.avgServiceMs), o.previous ? formatDuration(o.previous.avgServiceMs) : undefined], ['Tasa de no-show', formatPercent(o.stats.noShowRate), o.previous ? formatPercent(o.previous.noShowRate) : undefined],
  ];
  rows.push(...kv);
  for (const s of o.sections) rows.push('', [s.title], s.table.columns, ...s.table.rows);
  return toCsv(rows);
}

/** Clientes nuevos por día del periodo (por la primera vez que usaron la organización). */
export function newClientsPerDay(firstSeen: ReadonlyArray<Date | null>, now: Date, days: number): ChartPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(startOfDay(now), -(days - 1 - i));
    return { label: days <= 7 ? DAY[d.getDay()]! : dm(d), value: firstSeen.filter((f) => f && sameDay(f, d)).length, highlight: i === days - 1 };
  });
}
