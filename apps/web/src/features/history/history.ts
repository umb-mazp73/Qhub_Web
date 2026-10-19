import { err, ok, formatTurnNumber, type Result, toCsv, fromDateInput } from '@qhub/core';
import type { Ticket, TicketRepository } from '@qhub/api-client';

export interface HistoryStats {
  total: number; attended: number; noShow: number; cancelled: number; waiting: number;
  avgWaitMs: number | null; avgServiceMs: number | null; noShowRate: number;
}

export function computeStats(tickets: readonly Ticket[]): HistoryStats {
  let attended = 0, noShow = 0, cancelled = 0, waiting = 0;
  const waits: number[] = [];
  const services: number[] = [];
  for (const t of tickets) {
    if (t.status === 'finalizado') attended++;
    else if (t.status === 'no_show') noShow++;
    else if (t.status === 'cancelado') cancelled++;
    else waiting++;
    if (t.calledAt) {
      const since = t.scheduled ? t.slotStart : t.createdAt;
      waits.push(Math.max(0, t.calledAt.getTime() - since.getTime()));
      if (t.finishedAt) services.push(t.finishedAt.getTime() - t.calledAt.getTime());
    }
  }
  const avg = (l: number[]) => (l.length ? Math.floor(l.reduce((a, b) => a + b, 0) / l.length) : null);
  const resolved = attended + noShow;
  return { total: tickets.length, attended, noShow, cancelled, waiting, avgWaitMs: avg(waits), avgServiceMs: avg(services), noShowRate: resolved === 0 ? 0 : noShow / resolved };
}

export function ticketsToCsv(tickets: readonly Ticket[], queueNames: Record<string, string> = {}, prefixes: Record<string, string> = {}): string {
  return toCsv([
    'turno,cola,cliente,franja,estado,llegada,atencion,finalizacion,agente',
    ...tickets.map((t) => [
      formatTurnNumber(t.number, prefixes[t.queueId] ?? 'A'), queueNames[t.queueId] ?? t.queueId, t.userId, t.slotStart.toISOString(), t.status,
      t.createdAt.toISOString(), t.calledAt?.toISOString(), t.finishedAt?.toISOString(), t.agentId,
    ]),
  ]);
}

/** Carga todos los turnos de `days` días (hoy incluido) paginando de a 1000. */
export async function loadHistory(repo: TicketRepository, opts: { days: number; today: Date }): Promise<Result<Ticket[]>> {
  const out: Ticket[] = [];
  for (let i = 0; i < opts.days; i++) {
    const day = new Date(opts.today.getFullYear(), opts.today.getMonth(), opts.today.getDate() - i);
    for (let offset = 0; ; ) {
      const r = await repo.list({ date: day, limit: 1000, offset });
      if (!r.ok) return err(r.failure);
      out.push(...r.value);
      if (r.value.length < 1000) break;
      offset += r.value.length;
    }
  }
  return ok(out);
}

export const MAX_RANGE_DAYS = 31;

/** Valida un rango elegido en los calendarios. Devuelve el rango listo para `loadHistory` o un mensaje por campo. */
export function resolveRange(from: string, to: string, now: Date): { days: number; end: Date } | { errors: { from?: string; to?: string } } {
  const f = fromDateInput(from), t = fromDateInput(to);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const errors: { from?: string; to?: string } = {};
  if (!f) errors.from = 'Elige la fecha de inicio.';
  if (!t) errors.to = 'Elige la fecha final.';
  if (t && t > today) errors.to = 'La fecha final no puede ser futura.';
  if (f && t && f > t) errors.from = 'El inicio debe ser anterior al final.';
  if (Object.keys(errors).length || !f || !t) return { errors };
  const days = Math.round((t.getTime() - f.getTime()) / 864e5) + 1;
  if (days > MAX_RANGE_DAYS) return { errors: { from: `El rango máximo es de ${MAX_RANGE_DAYS} días.` } };
  return { days, end: t };
}
