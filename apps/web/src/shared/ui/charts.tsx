import { useState, type ReactNode } from 'react';
import { cx } from './cx';
import { Button } from './controls';
import { Panel, Table, Td, Th } from './display';

export interface Bar { label: string; value: number; highlight?: boolean }

/** Tope "redondo" del eje (1, 2, 5 × 10ⁿ) para que las marcas se lean fácil. */
export function niceMax(max: number): number {
  if (max <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const f = max / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

function Axis({ top, mid, children }: { top: string; mid: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <div className="t-caption flex flex-col justify-between text-right font-mono text-text-secondary" aria-hidden><span>{top}</span><span>{mid}</span><span>0</span></div>
      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col justify-between"><span className="border-t border-border-subtle" /><span className="border-t border-border-subtle" /><span className="border-b border-border-subtle" /></div>
        {children}
      </div>
    </div>
  );
}

/** Barras verticales con eje, cuadrícula y línea de promedio. Accesible: `role=img` con el resumen en texto (y la vista de tabla en `ChartPanel`). */
export function BarChart({ data, label, unit = 'turnos', height = 160, emptyText, showAverage = true }: { data: readonly Bar[]; label: string; unit?: string; height?: number; emptyText?: string; showAverage?: boolean }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceMax(max);
  const empty = max === 0;
  const avg = data.length ? data.reduce((a, d) => a + d.value, 0) / data.length : 0;
  const every = Math.ceil(data.length / 12);
  return (
    <figure className="m-0">
      <Axis top={fmt(top)} mid={fmt(top / 2)}>
        <div role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}`} className="relative flex items-end gap-1" style={{ height }}>
          {data.map((d) => (
            <div key={d.label} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label}: ${fmt(d.value)} ${unit}`}>
              {data.length <= 14 && d.value > 0 && <span className="t-caption pb-0.5 text-center font-mono text-text-secondary">{fmt(d.value)}</span>}
              <span className={cx('block w-full', d.highlight ? 'bg-brand-mint' : 'bg-interactive', 'group-hover:opacity-80')} style={{ height: `${d.value === 0 ? 0 : Math.max(2, (d.value / top) * 100)}%` }} />
            </div>
          ))}
          {showAverage && !empty && <span aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-text-secondary" style={{ bottom: `${(avg / top) * 100}%` }} />}
        </div>
      </Axis>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2" aria-hidden>
        <span className="invisible t-caption font-mono">{fmt(top)}</span>
        <div className="flex gap-1">{data.map((d, i) => <span key={`${d.label}-${i}`} className="t-caption min-w-0 flex-1 truncate text-center text-text-secondary">{i % every === 0 ? d.label : ''}</span>)}</div>
      </div>
      <figcaption className="t-caption mt-2 flex flex-wrap gap-x-4 gap-y-1 text-text-secondary">
        {empty ? (emptyText && <span role="status">{emptyText}</span>) : <>
          <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 bg-interactive" />{unit}</span>
          {data.some((d) => d.highlight) && <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 bg-brand-mint" />hoy</span>}
          {showAverage && <span className="inline-flex items-center gap-1"><span aria-hidden className="w-3 border-t border-dashed border-text-secondary" />promedio {fmt(Math.round(avg * 10) / 10)}</span>}
        </>}
      </figcaption>
    </figure>
  );
}

/** Línea con puntos cuadrados (plano, sin áreas ni degradados). `unit` va en la leyenda y el resumen. */
export function LineChart({ data, label, unit, emptyText }: { data: readonly Bar[]; label: string; unit: string; emptyText?: string }) {
  const W = 600, H = 170, L = 8, R = 12, T = 12, B = 8;
  const max = Math.max(...data.map((d) => d.value), 0);
  const top = niceMax(max);
  const x = (i: number) => (data.length <= 1 ? (W - L - R) / 2 + L : L + (i * (W - L - R)) / (data.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const every = Math.ceil(data.length / 12);
  return (
    <figure className="m-0">
      <Axis top={fmt(top)} mid={fmt(top / 2)}>
        <svg role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(', ')}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }}>
          {max > 0 && <polyline points={pts} fill="none" vectorEffect="non-scaling-stroke" className="stroke-interactive" strokeWidth="2" />}
        </svg>
        {max > 0 && data.map((d, i) => (
          <span key={`${d.label}-${i}`} title={`${d.label}: ${fmt(d.value)} ${unit}`} aria-hidden className={cx('absolute size-2 -translate-x-1/2 -translate-y-1/2', d.highlight ? 'bg-brand-mint' : 'bg-interactive')}
            style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(d.value) / H) * 100}%` }} />
        ))}
      </Axis>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2" aria-hidden>
        <span className="invisible t-caption font-mono">{fmt(top)}</span>
        <div className="flex">{data.map((d, i) => <span key={`${d.label}-${i}`} className="t-caption min-w-0 flex-1 truncate text-center text-text-secondary">{i % every === 0 ? d.label : ''}</span>)}</div>
      </div>
      <figcaption className="t-caption mt-2 text-text-secondary">{max === 0 ? (emptyText && <span role="status">{emptyText}</span>) : <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 bg-interactive" />{unit}</span>}</figcaption>
    </figure>
  );
}

export interface HBarRow { label: string; value: number; display?: string }
/** Barras horizontales ordenadas (ranking), con la cifra a la derecha. */
export function HBarChart({ rows, label, emptyText }: { rows: readonly HBarRow[]; label: string; emptyText?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0 || max === 0) return <p role="status" className="m-0 text-text-secondary">{emptyText ?? 'Sin datos todavía.'}</p>;
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-3" title={`${r.label}: ${r.display ?? fmt(r.value)}`}>
          <span className="truncate">{r.label}</span>
          <span aria-hidden className="h-3 bg-skeleton-bg"><span className="block h-full bg-interactive" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="font-mono text-text-secondary">{r.display ?? fmt(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export interface Segment { label: string; value: number; className: string }

/** Barra apilada (porcentajes) con leyenda: cada segmento lleva color + nombre + cifra. */
export function StackedBar({ segments, label, emptyText = 'Aún no hay datos para repartir.' }: { segments: readonly Segment[]; label: string; emptyText?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) return <p className="m-0 text-text-secondary" role="status">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div role="img" aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`} className="flex h-4 w-full bg-skeleton-bg">
        {segments.map((s) => s.value > 0 && <span key={s.label} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)} %)`} className={cx('block h-full', s.className)} style={{ width: `${(s.value / total) * 100}%` }} />)}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0">
        {segments.map((s) => <li key={s.label} className="flex items-center gap-2"><span aria-hidden className={cx('size-3', s.className)} /><span>{s.label}</span><span className="font-mono text-text-secondary">{s.value} · {Math.round((s.value / total) * 100)} %</span></li>)}
      </ul>
    </div>
  );
}

export interface TableView { columns: string[]; rows: Array<Array<string | number>> }

/** Los mismos datos de una gráfica, en tabla (lectura exacta, copiar y accesibilidad). */
export function DataTable({ label, columns, rows }: { label: string } & TableView) {
  return (
    <div className="max-h-[320px] overflow-auto border border-border-subtle">
      <Table label={label}>
        <thead><tr>{columns.map((c, i) => <Th key={c} num={i > 0}>{c}</Th>)}</tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => <Td key={ci} num={ci > 0} className={ci > 0 ? 'font-mono' : ''}>{cell}</Td>)}</tr>)}</tbody>
      </Table>
    </div>
  );
}

/** Interruptor de dos o más vistas (p. ej. Gráfico | Tabla). */
export function Segmented({ options, value, onChange, label }: { options: ReadonlyArray<{ value: string; label: string }>; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex border border-border-strong">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cx('min-h-control-sm cursor-pointer border-0 px-3', o.value === value ? 'bg-interactive text-text-on-color' : 'bg-transparent text-text-primary hover:bg-layer-hover')}>{o.label}</button>
      ))}
    </div>
  );
}

/** Panel de una gráfica: título y descripción, interruptor Gráfico/Tabla y descarga de sus datos en CSV. */
export function ChartPanel({ title, subtitle, chart, table, onCsv, wide }: { title: string; subtitle?: string; chart: ReactNode; table: TableView; onCsv?: () => void; wide?: boolean }) {
  const [view, setView] = useState('grafico');
  return (
    <div className={cx('min-w-0', wide && 'lg:col-span-2')}>
      <Panel>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="t-h3 m-0">{title}</h2>{subtitle && <p className="t-caption m-0 text-text-secondary">{subtitle}</p>}</div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Segmented label={`Vista de ${title}`} value={view} onChange={setView} options={[{ value: 'grafico', label: 'Gráfico' }, { value: 'tabla', label: 'Tabla' }]} />
            {onCsv && <Button kind="tertiary" size="sm" onClick={onCsv} aria-label={`Descargar CSV: ${title}`}>CSV</Button>}
          </div>
        </div>
        {view === 'grafico' ? chart : <DataTable label={`Datos de ${title}`} {...table} />}
        {view === 'grafico' && <div className="hidden print:block"><DataTable label={`Datos de ${title}`} {...table} /></div>}
      </Panel>
    </div>
  );
}
