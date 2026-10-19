import type { IconName } from '@qhub/design';
import { Icon, LiveIndicator, TurnBadge, TurnNumber } from '@/shared/ui';

const FEATURES: ReadonlyArray<{ icon: IconName; title: string }> = [
  { icon: 'live', title: 'Fila en vivo' }, { icon: 'calendar', title: 'Horarios y franjas' }, { icon: 'chart', title: 'Métricas y exportación' },
];

/** Fondo geométrico plano (no figurativo): cuadrícula, torres de fila y una ruta con nodos. Solo tokens del design system. */
function Backdrop() {
  return (
    <svg aria-hidden focusable="false" viewBox="0 0 1000 800" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <defs><pattern id="rejilla" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" className="stroke-border-subtle" strokeWidth="1" /></pattern></defs>
      <rect width="1000" height="800" fill="url(#rejilla)" />
      <g className="fill-sidebar-bg"><rect x="640" y="470" width="90" height="330" /><rect x="760" y="380" width="90" height="420" /></g>
      <g className="fill-interactive"><rect x="880" y="300" width="90" height="500" /><rect x="520" y="560" width="90" height="240" /></g>
      <g className="fill-brand-mint"><rect x="880" y="300" width="90" height="14" /><rect x="760" y="380" width="90" height="14" /><rect x="640" y="470" width="90" height="14" /><rect x="520" y="560" width="90" height="14" /></g>
      <polyline points="40,640 200,640 200,520 360,520 360,420 520,420" fill="none" className="stroke-interactive" strokeWidth="2" />
      {[[200, 640], [200, 520], [360, 520], [360, 420], [520, 420]].map(([x, y]) => <rect key={`${x}-${y}`} x={x! - 6} y={y! - 6} width="12" height="12" className="fill-brand-mint" />)}
      <rect x="40" y="120" width="120" height="120" className="fill-interactive" /><g className="fill-text-on-color">{[0, 1, 2, 3, 4].map((i) => <rect key={i} x="96" y={140 + i * 18} width="8" height="8" />)}</g>
    </svg>
  );
}

/** Vista previa decorativa de una fila (no es información real). */
function Preview() {
  return (
    <div aria-hidden className="w-full border border-border-subtle bg-layer-01 p-5">
      <div className="mb-2 flex items-center justify-between"><span className="t-h4">Atención al cliente</span><LiveIndicator label="En vivo" /></div>
      <div className="t-caption text-text-secondary">Atendiendo ahora</div>
      <TurnNumber number={23} prefix="A" xl className="text-state-serving-text" />
      <div className="mt-3 grid grid-cols-3 gap-px bg-border-subtle">
        {[['En espera', '4'], ['Atendiendo', '2'], ['Atendidos hoy', '38']].map(([k, v]) => (
          <div key={k} className="bg-layer-01 p-3"><div className="t-caption text-text-secondary">{k}</div><div className="t-h2 font-light">{v}</div></div>
        ))}
      </div>
      <div className="mt-3 flex flex-col">
        {[24, 25].map((n, i) => (
          <div key={n} className="flex items-center gap-3 border-t border-border-subtle py-2"><TurnNumber number={n} prefix="A" /><span className="t-code-sm text-text-secondary">{i === 0 ? '9:10' : '10:20'}</span><span className="ml-auto"><TurnBadge status="en_espera" /></span></div>
        ))}
      </div>
    </div>
  );
}

/** Mitad derecha del acceso: fondo plano con una tarjeta de marca. */
export function LoginShowcase() {
  return (
    <section className="relative hidden min-h-full items-center justify-center overflow-hidden bg-layer-02 p-12 md:order-1 md:flex">
      <Backdrop />
      <div className="relative flex w-full max-w-[480px] flex-col gap-5 border border-border-subtle bg-layer-01 p-8">
        <p className="t-label uppercase text-text-secondary">Qhub · Gestión de turnos</p>
        <h2 className="t-h1 m-0">Cada turno, en su lugar.</h2>
        <p className="t-body-long m-0 text-text-secondary">Administra colas, horarios y franjas, como persona o como organización, y sigue cada fila en tiempo real.</p>
        <Preview />
        <ul className="t-caption m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-text-secondary">
          {FEATURES.map((f) => <li key={f.title} className="flex items-center gap-2"><span className="text-link"><Icon name={f.icon} /></span>{f.title}</li>)}
        </ul>
      </div>
    </section>
  );
}
