import type { Result } from '@qhub/core';

export type NoticeKind = 'equipo' | 'cliente' | 'sistema';
export const NOTICE_KIND_LABEL: Record<NoticeKind, string> = { equipo: 'Equipo', cliente: 'Clientes', sistema: 'Sistema' };

/** Aviso para el equipo (tabla `notificaciones_staff`): lo generan triggers de la base, no la web. */
export interface StaffNotice {
  id: string; kind: NoticeKind; title: string; message: string; route: string | null; read: boolean; createdAt: Date;
}

/** Escucha en tiempo real los cambios de `notificaciones_staff` de una organización (Supabase Realtime). */
export interface NotificationsRealtime {
  subscribe(orgId: string, handlers: { onChange: () => void; onStatus: (s: 'connected' | 'error' | 'closed') => void }): () => void;
}

export interface NotificationsRepository {
  list(orgId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<Result<StaffNotice[]>>;
  unreadCount(orgId: string): Promise<Result<number>>;
  markRead(id: string): Promise<Result<void>>;
  markAllRead(orgId: string): Promise<Result<void>>;
  remove(id: string): Promise<Result<void>>;
  removeRead(orgId: string): Promise<Result<void>>;
}

/** Agrupa por día para la lista: Hoy / Ayer / Anteriores. */
export function groupByDay(items: readonly StaffNotice[], now = new Date()): Array<{ label: string; items: StaffNotice[] }> {
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = start(now);
  const groups: Record<string, StaffNotice[]> = { Hoy: [], Ayer: [], Anteriores: [] };
  for (const n of items) {
    const diff = Math.round((today - start(n.createdAt)) / 864e5);
    groups[diff <= 0 ? 'Hoy' : diff === 1 ? 'Ayer' : 'Anteriores']!.push(n);
  }
  return Object.entries(groups).filter(([, v]) => v.length > 0).map(([label, v]) => ({ label, items: v }));
}
