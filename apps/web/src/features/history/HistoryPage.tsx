import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { defaultQueuePrefix, formatDuration, formatHm, formatPercent, formatTurnNumber, toDateInput, unwrap, friendlyError } from '@qhub/core';
import { TICKET_STATUSES, TICKET_STATUS_LABEL, type TicketStatus } from '@qhub/api-client';
import { Button, DateField, EmptyState, IconButton, Kpi, Kpis, PageHead, Select, Skeleton, Table, Tabs, Td, TextField, Th, TurnBadge, TurnNumber, useToast } from '@/shared/ui';
import { useContainer } from '@/app/container';
import { AutoRefresh } from '@/features/shell/AutoRefresh';
import { computeStats, loadHistory, resolveRange, ticketsToCsv } from './history';
import { useRefreshInterval } from '@/features/preferences/hooks';
import { usePrefixes, useQueues } from '@/features/queues/hooks';
import { datedFilename, downloadText } from '@/shared/download';

const PAGE = 25;
const RANGES = [1, 7, 30] as const;

export function HistoryPage() {
  const { tickets } = useContainer();
  const toast = useToast();
  const [range, setRange] = useState(0);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [from, setFrom] = useState(() => toDateInput(new Date(Date.now() - 6 * 864e5)));
  const [to, setTo] = useState(() => toDateInput(new Date()));
  const every = useRefreshInterval();
  const custom = range === 3;
  const resolved = custom ? resolveRange(from, to, new Date()) : null;
  const rangeErrors = resolved && 'errors' in resolved ? resolved.errors : null;
  const plan = resolved && 'days' in resolved ? { days: resolved.days, today: resolved.end } : { days: RANGES[Math.min(range, 2)]!, today: new Date() };
  const history = useQuery({ queryKey: ['history', plan.days, toDateInput(plan.today)], enabled: !rangeErrors, refetchInterval: custom || every === false ? false : Math.max(every, 30_000), queryFn: async () => unwrap(await loadHistory(tickets, plan)) });
  const names: Record<string, string> = Object.fromEntries((useQueues().data ?? []).map((q) => [q.id, q.name]));
  const prefixes = usePrefixes().data ?? {};
  const prefixOf = (qid: string) => prefixes[qid] ?? defaultQueuePrefix(names[qid] ?? '');

  const all = history.data ?? [];
  const stats = computeStats(all);
  const q = query.trim().toLowerCase();
  const filtered = all.filter((t) => (!status || t.status === status) && (!q || formatTurnNumber(t.number, prefixOf(t.queueId)).toLowerCase().includes(q) || (names[t.queueId] ?? '').toLowerCase().includes(q) || t.userId.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE, cur * PAGE + PAGE);

  return (
    <div>
      <PageHead title="Historial y métricas" breadcrumb="Operación" actions={<><AutoRefresh keys={[['history']]} /><Tabs labels={['Hoy', '7 días', '30 días', 'Elegir fechas']} index={range} onChange={(i) => { setRange(i); setPage(0); }} /></>} />
      {custom && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:max-w-[480px] sm:grid-cols-2">
          <DateField label="Desde" value={from} max={toDateInput(new Date())} error={rangeErrors?.from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          <DateField label="Hasta" value={to} max={toDateInput(new Date())} error={rangeErrors?.to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        </div>
      )}
      {rangeErrors ? <EmptyState title="Revisa las fechas" message={rangeErrors.from ?? rangeErrors.to ?? 'Elige un rango válido.'} /> : history.isLoading ? <Skeleton height={200} /> : history.isError ? (
        <EmptyState title="No pudimos cargar esto" message={friendlyError(history.error)} action={<Button kind="tertiary" onClick={() => void history.refetch()}>Reintentar</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <Kpis>
            <Kpi label="Turnos atendidos" value={String(stats.attended)} hint={`de ${stats.total} en el periodo`} />
            <Kpi label="Espera promedio" value={formatDuration(stats.avgWaitMs)} />
            <Kpi label="Atención promedio" value={formatDuration(stats.avgServiceMs)} />
            <Kpi label="Tasa de no-show" value={formatPercent(stats.noShowRate)} hint={`${stats.noShow} no-show · ${stats.cancelled} cancelados`} />
          </Kpis>
          <div className="flex flex-wrap items-end gap-2 border border-border-subtle bg-layer-01 p-4">
            <div className="w-full sm:w-80"><TextField label="Buscar por turno, cola o cliente" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} /></div>
            <div className="w-full sm:w-[220px]">
              <Select<string> label="Estado" value={status} options={[{ value: '', label: 'Todos' }, ...TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))]} onValueChange={(v) => { setStatus(v as TicketStatus | ''); setPage(0); }} />
            </div>
            <span className="ml-auto">
              <Button icon="arrow-right" disabled={filtered.length === 0} onClick={() => {
                downloadText(datedFilename('turnos'), ticketsToCsv(filtered, names, Object.fromEntries(Object.keys(names).map((k) => [k, prefixOf(k)]))));
                toast.show(`Exportamos ${filtered.length} turnos.`);
              }}>Exportar CSV</Button>
            </span>
          </div>
          <div className="border border-border-subtle bg-layer-01">
            {filtered.length === 0 ? <EmptyState title="Sin turnos" message="No hay turnos para este periodo o filtro." /> : (
              <>
                <div className="overflow-x-auto"><Table label="Historial de turnos">
                  <thead><tr><Th>Turno</Th><Th>Cola</Th><Th>Cliente</Th><Th>Llegada</Th><Th>Atendió</Th><Th>Estado</Th><Th num>Duración</Th></tr></thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <Td><TurnNumber number={t.number} prefix={prefixOf(t.queueId)} /></Td>
                        <Td>{names[t.queueId] ?? '—'}</Td>
                        <Td className="font-mono t-caption text-text-secondary">{t.userId}</Td>
                        <Td className="font-mono">{formatHm(t.createdAt)}</Td>
                        <Td>{t.agentId ?? '—'}</Td>
                        <Td><TurnBadge status={t.status} /></Td>
                        <Td num className="font-mono">{t.calledAt && t.finishedAt ? formatDuration(t.finishedAt.getTime() - t.calledAt.getTime()) : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table></div>
                <div className="flex min-h-row flex-wrap py-2 items-center gap-2 border-t border-border-subtle px-4">
                  <span className="t-caption text-text-secondary flex-1">{cur * PAGE + 1}–{cur * PAGE + rows.length} de {filtered.length} turnos</span>
                  <span className="t-caption text-text-secondary">Página {cur + 1} de {pages}</span>
                  <IconButton icon="chevron-left" label="Anterior" disabled={cur === 0} onClick={() => setPage(cur - 1)} />
                  <IconButton icon="chevron-right" label="Siguiente" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
