import { useToast } from './toast';
import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { suggestEmailFix, generatePassword } from '@qhub/core';
import { TextField } from './controls';

export interface Option<T extends string> { value: T; label: string; hint?: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface ComboboxProps<T extends string> {
  label: string; value: T | ''; options: ReadonlyArray<Option<T>>; onValueChange: (v: T | '') => void;
  placeholder?: string; error?: string | null; helper?: string; disabled?: boolean; clearable?: boolean; emptyText?: string; large?: boolean; id?: string;
}

/** Lista desplegable con búsqueda: se elige, no se escribe el valor. Patrón ARIA combobox + listbox, con teclado completo. */
export function Combobox<T extends string>({ label, value, options, onValueChange, placeholder = 'Selecciona', error, helper, disabled, clearable, emptyText = 'Sin resultados', large, id }: ComboboxProps<T>) {
  const auto = useId();
  const fid = id ?? auto;
  const list = `${fid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => { const q = norm(query.trim()); return q ? options.filter((o) => norm(`${o.label} ${o.hint ?? ''}`).includes(q)) : options; }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  });
  useEffect(() => { document.getElementById(`${fid}-opt-${active}`)?.scrollIntoView?.({ block: 'nearest' }); }, [active, fid]);

  function close() { setOpen(false); setQuery(''); }
  function openList() { if (disabled) return; setOpen(true); setActive(Math.max(0, shown.findIndex((o) => o.value === value))); }
  function pick(o: Option<T>) { onValueChange(o.value); close(); }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); const o = shown[active]; if (o) pick(o); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
  }

  return (
    <div className="flex flex-col gap-1" ref={root}>
      <label htmlFor={fid} className="t-label text-text-secondary">{label}</label>
      <div className="relative">
        <div onClick={() => { if (disabled) return; input.current?.focus(); openList(); }}
          className={cx('flex items-center bg-field', !disabled && 'cursor-pointer', large ? 'min-h-control-lg' : 'min-h-control-md', error ? 'outline-2 outline-support-error' : 'border-b border-border-strong focus-within:border-transparent focus-within:outline-2 focus-within:outline-focus', disabled && 'text-text-disabled')}>
          <input ref={input} id={fid} role="combobox" aria-expanded={open} aria-controls={list} aria-autocomplete="list" aria-activedescendant={open && shown[active] ? `${fid}-opt-${active}` : undefined}
            aria-invalid={error ? true : undefined} aria-describedby={error || helper ? `${fid}-h` : undefined} autoComplete="off" disabled={disabled}
            className="h-full min-h-[inherit] min-w-0 flex-1 cursor-pointer border-0 bg-transparent px-4 outline-none placeholder:text-text-placeholder disabled:cursor-not-allowed"
            placeholder={selected ? selected.label : placeholder} value={open ? query : (selected?.label ?? '')}
            onFocus={openList} onClick={openList} onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }} onKeyDown={onKey} />
          {clearable && selected && !disabled && <button type="button" aria-label={`Quitar ${label.toLowerCase()}`} onClick={(e) => { e.stopPropagation(); onValueChange(''); close(); }} className="inline-flex cursor-pointer border-0 bg-transparent px-2 text-text-secondary"><Icon name="close" /></button>}
          {error ? <span className="inline-flex px-3 text-support-error"><Icon name="warning" /></span> : <span aria-hidden className="inline-flex px-3"><Icon name="chevron-down" /></span>}
        </div>
        {open && (
          <ul id={list} role="listbox" aria-label={label} className="absolute z-30 mt-px max-h-64 w-full overflow-auto bg-layer-01 py-1 shadow-overlay">
            {shown.length === 0 && <li className="px-4 py-3 text-text-secondary">{emptyText}</li>}
            {shown.map((o, i) => (
              <li key={o.value} id={`${fid}-opt-${i}`} role="option" aria-selected={o.value === value} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
                className={cx('flex min-h-control-md cursor-pointer items-center justify-between gap-3 px-4', i === active && 'bg-layer-hover', o.value === value && 'bg-layer-selected')}>
                <span>{o.label}</span>
                {o.hint ? <span className="t-code-sm text-text-secondary">{o.hint}</span> : o.value === value ? <Icon name="check" /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(error || helper) && <span id={`${fid}-h`} className={cx('t-caption', error ? 'text-support-error' : 'text-text-secondary')}>{error ?? helper}</span>}
    </div>
  );
}

type NativeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { label: string; error?: string | null; helper?: string; large?: boolean };

/** Fecha con el selector nativo del dispositivo (calendario): no se teclea. Valor `YYYY-MM-DD`. */
/** Al tocar en cualquier parte del campo se abre el calendario (no solo en el ícono). */
export const DateField = (p: NativeProps) => <TextField {...p} type="date" onClick={(e) => { try { (e.currentTarget as HTMLInputElement).showPicker?.(); } catch { /* el navegador no lo permite */ } p.onClick?.(e); }} />;
const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
/** Hora en 24 h elegida de una lista (el selector nativo del navegador mostraría AM/PM). Valor `HH:mm`. */
export function TimeField({ label, value, onValueChange, error, helper, stepMinutes = 5, id }: { label: string; value: string; onValueChange: (v: string) => void; error?: string | null; helper?: string; stepMinutes?: number; id?: string }) {
  const options = useMemo(() => {
    const list = Array.from({ length: Math.floor(1440 / stepMinutes) }, (_, i) => hm(i * stepMinutes));
    if (value && !list.includes(value)) list.push(value), list.sort();
    return list.map((t) => ({ value: t, label: t }));
  }, [stepMinutes, value]);
  return <Combobox label={label} value={value} options={options} onValueChange={onValueChange} error={error} helper={helper} placeholder="--:--" emptyText="Usa el formato 24 h (por ejemplo 08:30)" id={id} />;
}

export function Avatar({ text, size = 'md', className }: { text: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dim = { sm: 'size-8', md: 'size-10', lg: 'size-16' }[size];
  return <span aria-hidden className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-interactive text-text-on-color', size === 'lg' ? 't-h3' : 't-label', dim, className)}>{text}</span>;
}

export function Switch({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div><label htmlFor={id} className="block">{label}</label>{hint && <span className="t-caption text-text-secondary">{hint}</span>}</div>
      <button id={id} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-12 shrink-0 cursor-pointer rounded-md border-0 disabled:cursor-not-allowed', checked ? 'bg-interactive' : 'bg-border-strong')}>
        <span className={cx('absolute top-1 size-4 rounded-sm bg-layer-01 transition-[left] duration-100', checked ? 'left-7' : 'left-1')} />
      </button>
    </div>
  );
}

const STRENGTH = [
  { word: 'Muy débil', bar: 'bg-state-noshow' }, { word: 'Débil', bar: 'bg-state-noshow' }, { word: 'Aceptable', bar: 'bg-state-waiting' },
  { word: 'Buena', bar: 'bg-state-done' }, { word: 'Muy buena', bar: 'bg-state-serving' },
] as const;
export function StrengthMeter({ score, empty }: { score: number; empty?: boolean }) {
  if (empty) return null;
  const s = STRENGTH[Math.max(0, Math.min(4, score))]!;
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-1">
      <div className="flex gap-1" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={cx('h-1 flex-1', i < Math.max(1, score) ? s.bar : 'bg-skeleton-bg')} />)}</div>
      <span className="t-caption text-text-secondary">Seguridad: {s.word}</span>
    </div>
  );
}

/** Correo con aviso de posible error de tipeo («¿Quisiste decir nombre@gmail.com?») y botón para aceptar la corrección. */
export function EmailField({ label, value, onValueChange, error, helper, large, ...rest }: Omit<NativeProps, 'value' | 'onChange' | 'type'> & { value: string; onValueChange: (v: string) => void }) {
  const fix = suggestEmailFix(value);
  return (
    <div className="flex flex-col gap-1">
      <TextField label={label} type="email" inputMode="email" autoComplete="email" value={value} onChange={(e) => onValueChange(e.target.value)} error={error} helper={helper} large={large} {...rest} />
      {fix && !error && (
        <p role="status" className="t-caption m-0 flex flex-wrap items-center gap-2 text-text-secondary">
          ¿Quisiste decir <strong className="font-semibold text-text-primary">{fix}</strong>?
          <button type="button" onClick={() => onValueChange(fix)} className="cursor-pointer border-0 bg-transparent p-0 text-link underline">Usar este correo</button>
        </p>
      )}
    </div>
  );
}

/** «Generar contraseña segura»: crea una al azar (que cumple todas las reglas), la copia al portapapeles y la pone en los campos. */
export function GeneratePassword({ onGenerate }: { onGenerate: (password: string) => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={async () => {
      const pw = generatePassword();
      onGenerate(pw);
      let copied = false;
      try { await navigator.clipboard?.writeText(pw); copied = !!navigator.clipboard; } catch { /* sin permiso de portapapeles */ }
      toast.show(copied ? 'Generamos una contraseña segura y la copiamos. Guárdala en un lugar seguro.' : 'Generamos una contraseña segura. Pulsa el ojo para verla y guárdala en un lugar seguro.');
    }} className="w-fit cursor-pointer border-0 bg-transparent p-0 text-left text-link underline">Generar contraseña segura</button>
  );
}
