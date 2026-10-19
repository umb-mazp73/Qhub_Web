import { useEffect, useId, useRef, type ReactNode } from 'react';
import { TICKET_STATUS_LABEL, type TicketStatus } from '@qhub/api-client';
import { formatTurnNumber } from '@qhub/core';
import { STATUS_ICON, type IconName } from '@qhub/design';
import { Button } from './controls';
import { cx } from './cx';
import { Icon, Logo } from './Icon';

const BADGE: Record<TicketStatus, string> = { en_espera: 'bg-state-waiting', atendiendo: 'bg-state-serving', finalizado: 'bg-state-done', cancelado: 'bg-state-cancelled', no_show: 'bg-state-noshow' };

/** Estado del turno: color + ícono + palabra, nunca solo color. */
export function TurnBadge({ status }: { status: TicketStatus }) {
  return (
    <span role="status" aria-label={`Estado: ${TICKET_STATUS_LABEL[status]}`} className={cx('t-label inline-flex items-center gap-1 rounded-sm px-2 py-[3px] text-text-on-accent', BADGE[status])}>
      <Icon name={STATUS_ICON[status]} size={14} />{TICKET_STATUS_LABEL[status]}
    </span>
  );
}

export function TurnNumber({ number, prefix = 'A', xl, className }: { number: number; prefix?: string; xl?: boolean; className?: string }) {
  return <span className={cx('whitespace-nowrap', xl ? 't-turn-xl' : 't-turn', className)}>{formatTurnNumber(number, prefix)}</span>;
}

export function LiveIndicator({ live = true, onInk, label }: { live?: boolean; onInk?: boolean; label?: string }) {
  return (
    <span role="status" className={cx('t-caption inline-flex items-center gap-1', onInk ? 'text-sidebar-text' : 'text-text-secondary')}>
      <span aria-hidden className={cx('size-2 rounded-full', live ? 'animate-live bg-brand-mint' : 'bg-neutral-50')} />{label ?? (live ? 'En vivo' : 'Sin conexión')}
    </span>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <Logo name="qhub-simbolo" height={48} />
      <h3 className="t-h3">{title}</h3>
      {message && <p className="text-text-secondary">{message}</p>}
      {action}
    </div>
  );
}

export const Skeleton = ({ width, height = 16 }: { width?: number | string; height?: number }) => <div aria-hidden className="animate-shine bg-skeleton-bg" style={{ width, height }} />;

export type NoticeKind = 'info' | 'success' | 'warning' | 'error';
const NOTICE_ICON: Record<NoticeKind, IconName> = { info: 'info', success: 'check', warning: 'warning', error: 'error' };
const NOTICE_TONE: Record<NoticeKind, string> = { info: 'border-l-support-info text-support-info', success: 'border-l-support-success text-support-success', warning: 'border-l-support-warning text-support-warning', error: 'border-l-support-error text-support-error' };

export function Notice({ kind = 'info', title, message, action }: { kind?: NoticeKind; title: string; message?: string; action?: ReactNode }) {
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 border border-l-[3px] border-border-subtle bg-layer-01 p-3', NOTICE_TONE[kind].split(' ')[0])}>
      <span className={cx('mt-0.5 flex-none', NOTICE_TONE[kind].split(' ')[1])}><Icon name={NOTICE_ICON[kind]} size={20} /></span>
      <div className="min-w-0 flex-1"><div className="font-semibold">{title}</div>{message && <div className="text-text-secondary">{message}</div>}{action && <div className="mt-2">{action}</div>}</div>
    </div>
  );
}

export function Tabs({ labels, index, onChange }: { labels: readonly string[]; index: number; onChange: (i: number) => void }) {
  return (
    <div role="tablist" className="flex overflow-x-auto border-b border-border-subtle">
      {labels.map((l, i) => (
        <button key={l} type="button" role="tab" aria-selected={i === index} onClick={() => onChange(i)}
          className={cx('h-control-lg cursor-pointer whitespace-nowrap border-0 border-b-[3px] bg-transparent px-4', i === index ? 'border-b-interactive font-semibold text-text-primary' : 'border-b-transparent text-text-secondary')}>{l}</button>
      ))}
    </div>
  );
}

export function Panel({ title, trailing, flush, children }: { title?: string; trailing?: ReactNode; flush?: boolean; children: ReactNode }) {
  return (
    <section className={cx('border border-border-subtle bg-layer-01', flush ? 'p-0' : 'p-6')}>
      {title && <div className={cx('flex items-center justify-between', flush ? 'p-6 pb-3' : 'mb-4')}><h2 className="t-h3">{title}</h2>{trailing}</div>}
      {children}
    </section>
  );
}

export const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex flex-col gap-1 bg-layer-01 p-4"><span className="t-caption text-text-secondary">{label}</span><b className="t-h1 font-light">{value}</b>{hint && <span className="t-caption text-text-secondary">{hint}</span>}</div>
);

/** Fila de métricas separadas por 1 px (rejilla de KPIs). */
export const Kpis = ({ children, single }: { children: ReactNode; single?: boolean }) => (
  <div className={cx('grid gap-px bg-border-subtle', single ? 'grid-cols-1' : 'grid-cols-2 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2 lg:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]')}>{children}</div>
);

export function PageHead({ title, breadcrumb, actions }: { title: string; breadcrumb?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">{breadcrumb && <div className="t-caption text-text-secondary">{breadcrumb}</div>}<h1 className="t-h1">{title}</h1></div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

/** Diálogo modal accesible: foco inicial atrapado dentro, Escape y clic fuera lo cierran, y el foco vuelve a donde estaba. */
export function Dialog({ title, children, actions, onClose, wide }: { title: string; children: ReactNode; actions: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const heading = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const box = ref.current;
    const focusables = () => Array.from(box?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables().find((el) => el.tagName === 'INPUT') ?? box)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={heading} tabIndex={-1} className={cx('flex max-h-[90vh] flex-col gap-3 overflow-auto bg-layer-01 p-6 shadow-overlay outline-none', wide ? 'w-[min(720px,100%)]' : 'w-[min(440px,100%)]')}>
        <h2 id={heading} className="t-h3">{title}</h2>
        {children}
        <div className="mt-2 flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = 'Cancelar', danger = true, onConfirm, onCancel, extra, confirmDisabled }: {
  title: string; message: string; confirmLabel: string; cancelLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; extra?: ReactNode; confirmDisabled?: boolean;
}) {
  return (
    <Dialog title={title} onClose={onCancel} actions={<><Button kind="ghost" onClick={onCancel}>{cancelLabel}</Button><Button kind={danger ? 'danger' : 'primary'} disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-text-secondary">{message}</p>
      {extra}
    </Dialog>
  );
}

/** Tabla del design system: cabecera de 40 px sobre layer-02 y filas de 48 px. */
export const Table = ({ children, label }: { children: ReactNode; label: string }) => <table aria-label={label} className="w-full border-collapse">{children}</table>;
export const Th = ({ children, num }: { children?: ReactNode; num?: boolean }) => <th className={cx('t-label h-10 bg-layer-02 px-4 text-text-secondary', num ? 'text-right' : 'text-left')}>{children}</th>;
export const Td = ({ children, num, className }: { children?: ReactNode; num?: boolean; className?: string }) => <td className={cx('h-row border-t border-border-subtle px-4', num && 'text-right', className)}>{children}</td>;
