import { useMemo } from 'react';
import { Combobox, Select, TextField } from '@/shared/ui';
import { citiesOf, COUNTRIES, countryByAny, timeZonesOf } from '@qhub/core';

export interface Location { country: string; city: string; timeZone: string }

/** País → ciudad → zona horaria, todo por selección. `storeAs` define si el país se guarda como código ISO o como nombre. */
export function LocationFields({ value, onChange, storeAs = 'code', errors = {}, withTimeZone = true }: {
  value: Location; onChange: (next: Location) => void; storeAs?: 'code' | 'name'; errors?: Partial<Record<keyof Location, string | null>>; withTimeZone?: boolean;
}) {
  const country = countryByAny(value.country);
  const countryOptions = useMemo(() => COUNTRIES.map((c) => ({ value: c.code, label: c.name })), []);
  const cities = useMemo(() => {
    const list = [...citiesOf(value.country)];
    if (value.city && !list.includes(value.city)) list.unshift(value.city);   // dato antiguo escrito a mano: se conserva como opción
    return list.map((c) => ({ value: c, label: c }));
  }, [value.country, value.city]);
  const zones = useMemo(() => {
    const list = [...timeZonesOf(value.country)];
    if (value.timeZone && !list.some((z) => z.value === value.timeZone)) list.unshift({ value: value.timeZone, label: value.timeZone });
    return list;
  }, [value.country, value.timeZone]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Combobox label="País" value={country?.code ?? ''} options={countryOptions} error={errors.country} clearable
        onValueChange={(code) => {
          const c = countryByAny(code);
          onChange({ country: c ? (storeAs === 'code' ? c.code : c.name) : '', city: '', timeZone: c?.timeZones[0] ?? value.timeZone });
        }} />
      <Combobox label="Ciudad" value={value.city} options={cities} disabled={!country} clearable error={errors.city}
        helper={country ? undefined : 'Elige primero el país.'} onValueChange={(city) => onChange({ ...value, city })} />
      {withTimeZone && (zones.length > 1
        ? <div className="sm:col-span-2"><Select label="Zona horaria" value={value.timeZone} options={zones} onValueChange={(timeZone) => onChange({ ...value, timeZone })} /></div>
        : <div className="sm:col-span-2"><TextField label="Zona horaria" value={zones[0]?.label ?? ''} readOnly helper="Se completa con el país." /></div>)}
    </div>
  );
}
