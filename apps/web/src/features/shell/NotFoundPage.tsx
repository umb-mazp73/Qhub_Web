import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, Logo } from '@/shared/ui';

/** 404 con la marca: «cola» de turnos con el hueco donde estaba la página, mensaje claro y la salida más corta. No repite la dirección escrita. */
export function NotFoundPage() {
  const nav = useNavigate();
  useEffect(() => { document.title = 'Página no encontrada · Qhub'; }, []);
  const tickets = ['A-021', 'A-022', '404', 'A-024'];
  return (
    <section aria-labelledby="no-encontrada" className="-m-4 flex min-h-full flex-col bg-background sm:-m-6 md:-m-8">
      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-layer-02 px-6 py-16 text-center">
        <div aria-hidden className="flex flex-wrap items-center justify-center gap-2">
          {tickets.map((t) => (
            <span key={t} className={t === '404'
              ? 't-turn-xl border border-interactive bg-interactive px-6 py-3 text-text-on-color'
              : 't-body border border-border-subtle bg-layer-01 px-4 py-3 text-text-secondary opacity-70'}>{t}</span>
          ))}
        </div>
        <div className="flex max-w-[560px] flex-col items-center gap-3 border border-border-subtle bg-layer-01 p-8">
          <Logo name="qhub-simbolo" height={40} />
          <h1 id="no-encontrada" className="t-h2 m-0">Este no es el turno que buscas</h1>
          <p className="m-0 text-text-secondary">La página no existe o cambió de lugar. Revisa que la dirección esté bien escrita o vuelve al inicio.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button icon="arrow-right" onClick={() => nav('/inicio', { replace: true })}>Ir al inicio</Button>
            <Button kind="tertiary" onClick={() => nav(-1)}>Volver atrás</Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 px-6 py-8">
        <p className="t-caption m-0 flex items-center gap-2 text-text-secondary"><Icon name="search" />Busca turnos, colas y personas con Ctrl K</p>
        <Logo name="qhub-simbolo" height={20} />
      </div>
    </section>
  );
}
