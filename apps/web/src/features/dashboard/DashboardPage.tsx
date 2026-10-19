import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDuration, formatPercent, unwrap, friendlyError } from '@qhub/core';
import { BarChart, Button, ChartPanel, EmptyState, HBarChart, Kpi, Kpis, LineChart, Notice, PageHead, Skeleton, StackedBar, Tabs, useToast } from '@/shared/ui';
import { datedFilename, downloadText } from '@/shared/download';
import { useContainer, useSession } from '@/app/container';
import { useQueues } from '@/features/queues/hooks';
import { useRefreshInterval } from '@/features/preferences/hooks';
import { can } from '@/features/staff';
import { computeStats, loadHistory } from '@/features/history/history';
import { AutoRefresh } from '@/features/shell/AutoRefresh';
import {
  delta, deltaText, inPeriod, newClientsPerDay, PERIODS, perQueue, pointsToTable, previousPeriod, queueRowsToTable, reportToCsv, seriesPerDay, statusRows, statusToTable,
  tableToCsv, ticketsPerHour, waitPerDay, type Delta, type TableData,
} from './dashboard';

/** El historial son varias llamadas: aunque se pida refrescar cada 5 s, los gráficos no se recargan antes de 30 s. */
const HEAVY_MIN_MS = 30_000;
const ago = (days: number) => (days === 1 ? 'ayer' : `los ${days} días anteriores`);

/** Analítica de la operación: indicadores con comparación, gráficas con vista de tabla, y exportación (CSV y PDF). */
export function DashboardPage() {
  const { tickets, clients } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const m = session.membership!;
  const role = m.role;
  const now = useMemo(() => new Date(), []);
  const [period, setPeriod] = useState(1);              // índice en PERIODS: 7 días por defecto
  const { days, label: periodLabel } = PERIODS[period]!;
  const every = useRefreshInterval();
  const heavy = every === false ? false : Math.max(every, HEAVY_MIN_MS);
  const queues = useQueues();
  const history = useQuery({ queryKey: ['dashboard-history', days], refetchInterval: heavy, queryFn: async () => unwrap(await loadHistory(tickets, { days: days * 2, today: new Date() })) });
  const clientList = useQuery({ queryKey: ['clients', m.organization.id], enabled: can(role, 'clients.view'), refetchInterval: heavy, queryFn: async () => unwrap(await clients.list(m.organization.id)) });

  const all = history.data ?? [];
  const cur = useMemo(() => inPeriod(all, now, days), [all, now, days]);
  const prev = useMemo(() => previousPeriod(all, now, days), [all, now, days]);
  const stats = useMemo(() => computeStats(cur), [cur]);
  const prevStats = useMemo(() => computeStats(prev), [prev]);
  const names = useMemo(() => Object.fromEntries((queues.data ?? []).map((q) => [q.id, q.name])), [queues.data]);
  const byQueue = useMemo(() => perQueue(cur, names), [cur, names]);
  const status = statusRows(stats);
  const against = ago(days);

  const tickPoints = days === 1 ? ticketsPerHour(all, now) : seriesPerDay(all, now, days);
  const waitPoints = waitPerDay(all, now, days);
  const newClients = newClientsPerDay((clientList.data ?? []).map((c) => c.firstSeen), now, Math.max(days, 7));
  const tables: Record<string, TableData> = {
    tickets: pointsToTable(tickPoints, days === 1 ? 'Hora' : 'Día', 'Turnos'),
    wait: pointsToTable(waitPoints, 'Día', 'Espera promedio (min)'),
    status: statusToTable(status),
    queues: queueRowsToTable(byQueue),
    clients: pointsToTable(newClients, 'Día', 'Clientes nuevos'),
  };
  const csv = (key: string, name: string) => () => { downloadText(datedFilename(name, 'csv', now), tableToCsv(tables[key]!)); toast.show('Descargamos los datos de la gráfica.'); };

  function exportAll() {
    const sections = [
      { title: days === 1 ? 'Turnos por hora' : 'Turnos por día', table: tables.tickets! }, ...(days > 1 ? [{ title: 'Espera promedio por día', table: tables.wait! }] : []),
      { title: 'Estado de los turnos', table: tables.status! }, { title: 'Resumen por cola', table: tables.queues! },
    ];
    downloadText(datedFilename('reporte', 'csv', now), reportToCsv({ organization: m.organization.name, periodLabel, now, stats, previous: prevStats, sections }));
    toast.show('Descargamos el reporte completo.');
  }
  function exportPdf() {
    const before = document.title;
    document.title = `Reporte ${m.organization.name} · ${periodLabel}`;
    const restore = () => { document.title = before; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  const kpi = (label: string, value: string, d: Delta | null, hint?: string) => <Kpi label={label} value={value} hint={d ? deltaText(d, against) : hint} />;

  return (
    <div>
      <PageHead title="Dashboard" breadcrumb="Operación" actions={<>
        <AutoRefresh keys={[['dashboard-history'], ['queues'], ['clients']]} />
        {can(role, 'export.data') && <>
          <Button kind="secondary" disabled={!history.data} onClick={exportAll}>Descargar CSV</Button>
          <Button kind="secondary" disabled={!history.data} onClick={exportPdf}>Descargar PDF</Button>
        </>}
      </>} />
      <div className="mb-4 hidden print:block"><h2 className="t-h2 m-0">{m.organization.name}</h2><p className="m-0 text-text-secondary">Reporte · {periodLabel} · generado el {now.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short', hour12: false })}</p></div>
      <div className="mb-4 overflow-x-auto print:hidden"><Tabs labels={PERIODS.map((p) => p.label)} index={period} onChange={setPeriod} /></div>

      {history.isLoading ? <div className="flex flex-col gap-4"><Skeleton height={96} /><Skeleton height={220} /></div> : history.isError ? (
        <EmptyState title="No pudimos cargar el dashboard" message={friendlyError(history.error)} action={<Button kind="tertiary" onClick={() => void history.refetch()}>Reintentar</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <Kpis>
            {kpi('Turnos', String(stats.total), delta(stats.total, prevStats.total))}
            {kpi('Atendidos', String(stats.attended), delta(stats.attended, prevStats.attended))}
            {kpi('Espera promedio', formatDuration(stats.avgWaitMs), null, 'min:seg')}
            {kpi('Atención promedio', formatDuration(stats.avgServiceMs), null, 'min:seg')}
            {kpi('Tasa de no-show', formatPercent(stats.noShowRate), delta(stats.noShow, prevStats.noShow), `${stats.noShow} no-show`)}
          </Kpis>
          {stats.total === 0 && <Notice kind="info" title={`No hay turnos en ${periodLabel === 'Hoy' ? 'el día de hoy' : `los últimos ${days} días`}.`} message="Cuando lleguen turnos, las gráficas se llenan solas." />}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartPanel wide title={days === 1 ? 'Turnos por hora' : 'Turnos por día'} subtitle={days === 1 ? 'Hora de llegada de los turnos de hoy.' : `Turnos creados cada día en ${periodLabel === '7 días' ? 'la última semana' : 'el último mes'}.`}
              table={tables.tickets!} onCsv={csv('tickets', 'turnos')} chart={<BarChart data={tickPoints} label={days === 1 ? 'Turnos por hora' : 'Turnos por día'} emptyText="Sin turnos en este periodo." height={180} />} />
            {days > 1 && <ChartPanel title="Espera promedio" subtitle="Minutos entre la hora del turno y cuando se llamó." table={tables.wait!} onCsv={csv('wait', 'espera-promedio')}
              chart={<LineChart data={waitPoints} label="Espera promedio por día" unit="minutos de espera" emptyText="Aún no hay turnos atendidos." />} />}
            <ChartPanel title="Estado de los turnos" subtitle="Cómo terminó cada turno del periodo." table={tables.status!} onCsv={csv('status', 'estado-de-turnos')}
              chart={<StackedBar label="Estado de los turnos" emptyText="Sin turnos en este periodo." segments={[
                { label: 'Finalizado', value: stats.attended, className: 'bg-state-done' }, { label: 'En espera', value: stats.waiting, className: 'bg-state-waiting' },
                { label: 'Cancelado', value: stats.cancelled, className: 'bg-state-cancelled' }, { label: 'No-show', value: stats.noShow, className: 'bg-state-noshow' }]} />} />
            <ChartPanel wide={days === 1} title="Resumen por cola" subtitle="Turnos del periodo por cola, con su espera promedio." table={tables.queues!} onCsv={csv('queues', 'por-cola')}
              chart={<HBarChart label="Turnos por cola" emptyText="Sin turnos en este periodo." rows={byQueue.map((q) => ({ label: q.name, value: q.total, display: `${q.total} · espera ${formatDuration(q.avgWaitMs)}` }))} />} />
            {can(role, 'clients.view') && <ChartPanel title="Clientes nuevos" subtitle="Personas de la app móvil que usaron tu cuenta por primera vez." table={tables.clients!} onCsv={csv('clients', 'clientes-nuevos')}
              chart={<BarChart data={newClients} label="Clientes nuevos por día" unit="clientes" emptyText="Sin clientes nuevos en este periodo." height={140} />} />}
          </div>
        </div>
      )}
    </div>
  );
}
