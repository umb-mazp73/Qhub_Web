import { useState } from 'react';

const EYE = <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" /><circle cx="8" cy="8" r="2" /></svg>;
const EYE_OFF = <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 2l12 12" /><path d="M6.6 3.7A7 7 0 0 1 8 3.5C12.5 3.5 15 8 15 8a11 11 0 0 1-2.2 2.7M9.4 12.3A7 7 0 0 1 8 12.5C3.5 12.5 1 8 1 8a11 11 0 0 1 2.5-2.9" /><path d="M6.5 6.5a2 2 0 0 0 3 3" /></svg>;

/** Valor secreto (una contraseña): sale oculto con puntos y se ve solo al pulsar el ojo. */
export function SecretValue({ value, label = 'contraseña' }: { value: string; label?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="min-w-0 break-all font-mono" data-testid="secret-value">{shown ? value : '•'.repeat(Math.min(Math.max(value.length, 8), 16))}</span>
      <button type="button" aria-pressed={shown} aria-label={shown ? `Ocultar la ${label}` : `Mostrar la ${label}`} title={shown ? `Ocultar la ${label}` : `Mostrar la ${label}`} onClick={() => setShown((v) => !v)}
        className="inline-flex size-8 flex-none cursor-pointer items-center justify-center border-0 bg-transparent text-text-primary hover:bg-layer-hover">{shown ? EYE_OFF : EYE}</button>
    </span>
  );
}
