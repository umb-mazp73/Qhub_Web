/** Descarga un texto como archivo en el navegador (CSV por defecto). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `prefijo-2026-10-17.csv`: nombre de archivo de un reporte exportado hoy. */
export const datedFilename = (prefix: string, ext = 'csv', now = new Date()): string => `${prefix}-${now.toISOString().slice(0, 10)}.${ext}`;
