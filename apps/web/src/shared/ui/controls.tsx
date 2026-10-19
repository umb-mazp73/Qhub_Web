import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { IconName } from '@qhub/design';
import { cx } from './cx';
import { Icon } from './Icon';

export type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'accent';

const KIND: Record<ButtonKind, string> = {
  primary: 'bg-interactive text-text-on-color hover:bg-interactive-hover active:bg-interactive-active',
  secondary: 'bg-layer-02 text-text-primary shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-layer-hover',
  tertiary: 'bg-transparent text-link shadow-[inset_0_0_0_1px_var(--link)] hover:bg-layer-hover',
  ghost: 'bg-transparent text-link hover:bg-layer-hover',
  danger: 'bg-support-error text-text-on-color hover:opacity-90',
  accent: 'bg-brand-mint text-text-on-accent hover:opacity-90',
};
const SIZE = { sm: 'min-h-control-sm', md: 'min-h-control-md', lg: 'min-h-control-lg' } as const;

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  kind?: ButtonKind; size?: 'sm' | 'md' | 'lg'; icon?: IconName; block?: boolean; loading?: boolean; children: ReactNode;
}

/** Botón del design system: texto a la izquierda, ícono a la derecha, una sola primaria por vista. */
export function Button({ kind = 'primary', size = 'md', icon, block, loading, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex cursor-pointer items-center justify-between gap-2 whitespace-nowrap rounded-sm border-0 px-4 focus-visible:shadow-[inset_0_0_0_1px_var(--focus-inset)]',
        'disabled:cursor-not-allowed disabled:bg-layer-selected disabled:text-text-disabled disabled:shadow-none aria-busy:cursor-progress',
        KIND[kind], SIZE[size], block && 'w-full', className)}>
      <span>{children}</span>
      {loading ? <span aria-hidden>…</span> : icon ? <Icon name={icon} /> : null}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }: { icon: IconName; label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} aria-label={label} title={label}
      className="inline-flex h-control-md w-control-md cursor-pointer items-center justify-center rounded-sm bg-transparent text-text-primary hover:bg-layer-hover disabled:cursor-not-allowed disabled:text-text-disabled">
      <Icon name={icon} size={20} />
    </button>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> { label: string; error?: string | null; helper?: string; large?: boolean; revealable?: boolean }

/** Campo con label arriba, fondo `field` y borde inferior. Error: contorno 2 px + ícono + mensaje. */
export function TextField({ label, error, helper, large, revealable, type = 'text', id, ...rest }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const [shown, setShown] = useState(false);
  const isPw = revealable && type === 'password';
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className="t-label text-text-secondary">{label}</label>
      <div className={cx('flex items-center bg-field', large ? 'min-h-control-lg' : 'min-h-control-md', error ? 'outline-2 outline-support-error' : 'border-b border-border-strong focus-within:border-transparent focus-within:outline-2 focus-within:outline-focus', rest.disabled && 'text-text-disabled')}>
        <input id={fid} type={isPw && shown ? 'text' : type} aria-invalid={error ? true : undefined} aria-describedby={error || helper ? `${fid}-h` : undefined}
          className="h-full min-h-[inherit] min-w-0 flex-1 border-0 bg-transparent px-4 outline-none placeholder:text-text-placeholder" {...rest} />
        {isPw && <button type="button" onClick={() => setShown((s) => !s)} className="t-label cursor-pointer border-0 bg-transparent px-3 text-link">{shown ? 'Ocultar' : 'Mostrar'}</button>}
        {error && <span className="inline-flex px-3 text-support-error"><Icon name="warning" /></span>}
      </div>
      {(error || helper) && <span id={`${fid}-h`} className={cx('t-caption', error ? 'text-support-error' : 'text-text-secondary')}>{error ?? helper}</span>}
    </div>
  );
}

interface SelectProps<T extends string | number> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onValueChange: (v: T) => void; hideLabel?: boolean;
}

export function Select<T extends string | number>({ label, value, options, onValueChange, id, hideLabel, ...rest }: SelectProps<T>) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className={cx('t-label text-text-secondary', hideLabel && 'sr-only')}>{label}</label>
      {/* El selector ocupa toda la caja y la flecha es solo un dibujo encima: se abre al tocar en cualquier parte. */}
      <div className="relative flex min-h-control-md items-center border-b border-border-strong bg-field focus-within:border-transparent focus-within:outline-2 focus-within:outline-focus">
        <select id={fid} value={String(value)} onChange={(e) => { const o = options.find((x) => String(x.value) === e.target.value); if (o) onValueChange(o.value); }}
          className="h-full min-h-[inherit] w-full min-w-0 cursor-pointer appearance-none border-0 bg-transparent py-0 pl-4 pr-10 outline-none disabled:cursor-not-allowed disabled:text-text-disabled" {...rest}>
          {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
        <span aria-hidden className="pointer-events-none absolute right-3 inline-flex"><Icon name="chevron-down" /></span>
      </div>
    </div>
  );
}

export function Checkbox({ label, ...rest }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" className="size-[18px] accent-interactive" {...rest} />{label}</label>;
}
