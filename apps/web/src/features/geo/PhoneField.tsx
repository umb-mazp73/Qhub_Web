import { useMemo } from 'react';
import { Combobox, TextField } from '@/shared/ui';
import { COUNTRIES } from '@qhub/core';

const DIALS = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);

/** Separa "+593 991234567" en prefijo y número. */
export function splitPhone(v: string, fallbackDial: string): { dial: string; number: string } {
  const t = v.trim();
  const dial = DIALS.find((d) => t.startsWith(d));
  return dial ? { dial, number: t.slice(dial.length).trim() } : { dial: fallbackDial, number: t };
}

/** Teléfono con prefijo elegido de una lista y número que solo admite dígitos. */
export function PhoneField({ label = 'Teléfono', value, onChange, defaultCountry = 'EC', error, disabled }: { disabled?: boolean; label?: string; value: string; onChange: (v: string) => void; defaultCountry?: string; error?: string | null }) {
  const options = useMemo(() => COUNTRIES.map((c) => ({ value: `${c.code}|${c.dial}`, label: `${c.code} ${c.dial}`, hint: c.name })), []);
  const fallback = COUNTRIES.find((c) => c.code === defaultCountry)?.dial ?? '+593';
  const { dial, number } = splitPhone(value, fallback);
  const selected = options.find((o) => o.value.endsWith(`|${dial}`))?.value ?? '';
  const emit = (d: string, n: string) => onChange(n.trim() ? `${d} ${n.trim()}` : '');
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr] items-start gap-2">
      <Combobox label="Prefijo" disabled={disabled} value={selected} options={options} onValueChange={(v) => emit(v.split('|')[1] ?? fallback, number)} />
      <TextField label={label} disabled={disabled} type="tel" inputMode="tel" autoComplete="tel-national" value={number} error={error} placeholder="991234567"
        onChange={(e) => emit(dial, e.target.value.replace(/[^0-9 ()-]/g, ''))} />
    </div>
  );
}
