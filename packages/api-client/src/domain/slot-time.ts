import type { Schedule, Slot } from './entities';

/**
 * El cliente nunca debe calcular con la hora del dispositivo: las franjas se cuentan en la zona de la cola.
 * Sin base de datos de zonas, el desfase (en minutos) se deduce de la API: la primera franja del día empieza
 * exactamente a la hora de apertura (hora local de la cola).
 */
export function queueUtcOffsetMinutes(schedule: Pick<Schedule, 'opens'>, slots: readonly Slot[]): number | null {
  if (slots.length === 0) return null;
  const first = slots.reduce((a, b) => (a.start.getTime() <= b.start.getTime() ? a : b)).start;
  const [h = '0', m = '0'] = schedule.opens.split(':');
  let diff = Number(h) * 60 + Number(m) - (first.getUTCHours() * 60 + first.getUTCMinutes());
  while (diff > 14 * 60) diff -= 24 * 60;
  while (diff <= -12 * 60) diff += 24 * 60;
  return diff;
}

/** Fecha con los campos UTC en hora de la cola (leer con getUTC*). */
export const inQueueTime = (instant: Date, offsetMinutes: number): Date => new Date(instant.getTime() + offsetMinutes * 60_000);
