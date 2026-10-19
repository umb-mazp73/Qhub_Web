/** Número de turno como el design system: prefijo, guion y tres dígitos (`A-023`). */
export const formatTurnNumber = (n: number, prefix = 'A'): string => `${prefix}-${String(n).padStart(3, '0')}`;

/** Prefijo por defecto de una cola: su primera letra A–Z (`Caja 1` → `C`), o `A`. */
export function defaultQueuePrefix(queueName: string): string {
  for (const ch of queueName.toUpperCase()) if (/^[A-Z]$/.test(ch)) return ch;
  return 'A';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Hora en 24 h (`09:30`) en la zona del dispositivo. */
export const formatHm = (d: Date): string => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

/** Hora en 24 h leyendo los campos UTC (para fechas ya desplazadas a la zona de la cola). */
export const formatHmUtc = (d: Date): string => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;

/** Recorta `08:00:00` a `08:00`. */
export const trimSeconds = (t: string): string => (t.length >= 5 ? t.slice(0, 5) : t);

/** Espera estimada en minutos: `ceil(personasDelante / puestos) × duraciónTurno`. Es aritmética del horario, no predicción. */
export function estimateWaitMinutes(opts: { peopleAhead: number; turnMinutes: number; stations?: number }): number {
  if (opts.peopleAhead <= 0) return 0;
  const lanes = Math.max(1, opts.stations ?? 1);
  return Math.ceil(opts.peopleAhead / lanes) * opts.turnMinutes;
}
