/** Un campo CSV: comillas solo cuando hace falta (coma, comilla o salto de línea). */
export const csvField = (v: unknown): string => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };

/** Filas → texto CSV con salto de línea final. Una fila ya armada (string) se respeta tal cual. */
export const toCsv = (rows: ReadonlyArray<string | readonly unknown[]>): string =>
  `${rows.map((r) => (typeof r === 'string' ? r : r.map(csvField).join(','))).join('\n')}\n`;
