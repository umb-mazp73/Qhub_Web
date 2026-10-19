/** Utilidades de fecha para `<input type="date">` (hora local). */
const pad = (n: number) => String(n).padStart(2, '0');
/** `YYYY-MM-DD` en hora local (lo que entrega y espera `<input type="date">`). */
export const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateInput = (v: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
};
