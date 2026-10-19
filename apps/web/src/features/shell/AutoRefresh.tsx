import { useEffect, useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Button, Select } from '@/shared/ui';
import { applyPreferences, getPreferences, REFRESH_OPTIONS, refreshLabel, type RefreshSeconds } from '@/features/preferences/preferences';
import { usePreferences } from '@/features/preferences/hooks';

const OPTIONS = REFRESH_OPTIONS.map((s) => ({ value: s, label: refreshLabel(s) }));
const hms = (d: Date) => d.toLocaleTimeString('es', { hour12: false });

/** Actualización automática de los datos de la pantalla: intervalo elegible, botón para actualizar ya y hora de la última carga. */
export function AutoRefresh({ keys }: { keys: ReadonlyArray<readonly unknown[]> }) {
  const qc = useQueryClient();
  const { refreshSeconds } = usePreferences();
  const fetching = useIsFetching() > 0;
  const [updated, setUpdated] = useState(() => new Date());
  const was = useRef(fetching);
  useEffect(() => { if (was.current && !fetching) setUpdated(new Date()); was.current = fetching; }, [fetching]);

  return (
    <div className="flex flex-wrap items-end gap-2 print:hidden">
      <span role="status" aria-live="off" className="t-caption pb-2 text-text-secondary">{fetching ? 'Actualizando…' : `Actualizado ${hms(updated)}`}</span>
      <div className="w-[170px]">
        <Select<RefreshSeconds> label="Actualización automática" hideLabel value={refreshSeconds} options={OPTIONS}
          onValueChange={(s) => applyPreferences({ ...getPreferences(), refreshSeconds: s })} />
      </div>
      <Button kind="tertiary" onClick={() => { keys.forEach((k) => void qc.invalidateQueries({ queryKey: [...k] })); }}>Actualizar</Button>
    </div>
  );
}
