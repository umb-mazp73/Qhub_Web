import { formatTurnNumber } from '@qhub/core';
import { cx } from './cx';
import { LiveIndicator, TurnBadge } from './display';

/** Resumen rectangular de una cola. Sin sombra ni radio. */
export function QueueTile({ name, subtitle, waiting, serving, currentNumber, prefix = 'A', live = true, closed, onClick }: {
  name: string; subtitle?: string; waiting: number; serving: number; currentNumber?: number | null; prefix?: string; live?: boolean; closed?: boolean; onClick?: () => void;
}) {
  const total = waiting + serving;
  return (
    <button type="button" onClick={closed ? undefined : onClick} aria-label={`${name}, ${waiting} en espera, ${serving} atendiendo`}
      className={cx('flex w-full flex-col gap-4 border border-border-subtle bg-layer-01 p-6 text-left', closed ? 'cursor-default opacity-80' : 'cursor-pointer hover:bg-layer-hover')}>
      <div className="flex items-start justify-between">
        <div><div className="t-h4">{name}</div>{subtitle && <div className="t-caption text-text-secondary">{subtitle}</div>}</div>
        {closed ? <span className="t-label rounded-sm bg-state-cancelled px-2 py-[3px] text-text-on-accent">Archivada</span> : <LiveIndicator live={live} />}
      </div>
      <div className="flex items-center gap-2">
        {currentNumber != null ? <><span className="t-turn">{formatTurnNumber(currentNumber, prefix)}</span><TurnBadge status="atendiendo" /></> : <span className="text-text-secondary">Sin turno en atención</span>}
      </div>
      <div aria-hidden className="flex h-2 gap-0.5 bg-border-subtle">
        {total > 0 && serving > 0 && <span className="bg-state-serving" style={{ flex: serving }} />}
        {total > 0 && waiting > 0 && <span className="bg-state-waiting" style={{ flex: waiting }} />}
      </div>
      <div className="flex gap-8">
        <div><div className="t-caption text-text-secondary">En espera</div><div className="t-turn">{waiting}</div></div>
        <div><div className="t-caption text-text-secondary">Atendiendo</div><div className="t-turn">{serving}</div></div>
      </div>
    </button>
  );
}
