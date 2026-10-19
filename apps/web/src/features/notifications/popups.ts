import type { StaffNotice } from './notifications';

/** Avisos sin leer que todavía no se mostraron como emergentes (del más viejo al más nuevo). */
export function freshNotices(items: readonly StaffNotice[], seen: ReadonlySet<string>): StaffNotice[] {
  return items.filter((n) => !n.read && !seen.has(n.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

const KEY = 'qhub.avisos-del-navegador';
/** ¿Puede este navegador mostrar avisos del sistema? */
export const systemNoticesSupported = (): boolean => typeof Notification !== 'undefined';
export const systemNoticesGranted = (): boolean => systemNoticesSupported() && Notification.permission === 'granted';
export const systemNoticesDenied = (): boolean => systemNoticesSupported() && Notification.permission === 'denied';
export function systemNoticesOn(): boolean { try { return systemNoticesGranted() && localStorage.getItem(KEY) !== '0'; } catch { return systemNoticesGranted(); } }
export function setSystemNotices(on: boolean): void { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* sin storage */ } }
/** Pide permiso al navegador (hay que llamarlo desde un clic). */
export async function enableSystemNotices(): Promise<boolean> {
  if (!systemNoticesSupported()) return false;
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  setSystemNotices(p === 'granted');
  return p === 'granted';
}
