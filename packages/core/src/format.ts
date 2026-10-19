/** `m:ss` (`7:12`) o `—` si no hay dato. */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** `14,3 %` (coma decimal). */
export const formatPercent = (v: number): string => `${(v * 100).toFixed(1).replace('.', ',')} %`;

/** "ahora", "hace 5 min", "hace 2 h", "ayer", "hace 4 días", "12 oct". */
export function timeAgo(d: Date, now = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (s < 45) return 'ahora';
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 864e5);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
}
