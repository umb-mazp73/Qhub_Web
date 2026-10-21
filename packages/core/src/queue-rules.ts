/** Reglas de cada cola que la API no guarda (descansos y márgenes). Las aplica el servidor (qhub-proxy); la web las edita. Horas en 24 h, de la zona de la cola. */
export interface QueueBreak { readonly from: string; readonly to: string }
export interface QueueRules {
  readonly breaks: readonly QueueBreak[];
  /** Espera mínima (min) de un turno «ahora». */
  readonly nowMarginMinutes: number;
  /** Una cita debe empezar al menos tantos minutos después de «ahora». */
  readonly appointmentLeadMinutes: number;
  /** Citas activas por persona y cola. */
  readonly maxActiveAppointments: number;
}

export const DEFAULT_QUEUE_RULES: QueueRules = { breaks: [], nowMarginMinutes: 3, appointmentLeadMinutes: 5, maxActiveAppointments: 3 };
export const MAX_BREAKS = 6;

const HM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;
const toMin = (v: string): number => { const m = HM.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN; };

/** Descansos válidos para guardar: dentro del horario, desde < hasta y sin cruzarse. Devuelve el mensaje de error o `null`. */
export function validateBreaks(list: readonly QueueBreak[], opens: string, closes: string): string | null {
  if (list.length > MAX_BREAKS) return `Máximo ${MAX_BREAKS} descansos.`;
  const open = toMin(opens), close = toMin(closes);
  const sorted = list.map((b) => ({ a: toMin(b.from), b: toMin(b.to) })).sort((x, y) => x.a - y.a);
  for (const [i, d] of sorted.entries()) {
    if (Number.isNaN(d.a) || Number.isNaN(d.b)) return 'Elige la hora de inicio y de fin de cada descanso.';
    if (d.b <= d.a) return 'El descanso debe terminar después de empezar.';
    if (d.a < open || d.b > close) return `Cada descanso debe estar dentro del horario de atención (${opens}–${closes}).`;
    if (i > 0 && d.a < sorted[i - 1]!.b) return 'Los descansos no pueden cruzarse.';
  }
  return null;
}
