import type { SupabaseClient } from '@supabase/supabase-js';
import { err, type Failure, failureFromSupabase, ok, type Result } from '@qhub/core';
import type { NoticeKind, NotificationsRepository, StaffNotice } from './notifications';

type Row = Record<string, unknown>;
const KINDS: readonly NoticeKind[] = ['equipo', 'cliente', 'sistema'];

export class SupabaseNotificationsRepository implements NotificationsRepository {
  constructor(private readonly sb: SupabaseClient) {}

  private async run<T>(body: () => Promise<T>): Promise<Result<T>> {
    try { return ok(await body()); } catch (e) { return err(failureFromSupabase(e) as Failure); }
  }
  private notice(r: Row): StaffNotice {
    return { id: String(r.id), kind: (KINDS as readonly unknown[]).includes(r.tipo) ? (r.tipo as NoticeKind) : 'sistema', title: String(r.titulo), message: String(r.mensaje),
      route: typeof r.ruta === 'string' ? r.ruta : null, read: Boolean(r.leida), createdAt: new Date(String(r.creada_en)) };
  }

  list(orgId: string, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    return this.run(async () => {
      let q = this.sb.from('notificaciones_staff').select('*').eq('organizacion_id', orgId).order('creada_en', { ascending: false }).limit(opts.limit ?? 100);
      if (opts.unreadOnly) q = q.eq('leida', false);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => this.notice(r));
    });
  }
  unreadCount(orgId: string) {
    return this.run(async () => {
      const { count, error } = await this.sb.from('notificaciones_staff').select('id', { count: 'exact', head: true }).eq('organizacion_id', orgId).eq('leida', false);
      if (error) throw error;
      return count ?? 0;
    });
  }
  markRead(id: string) { return this.run(async () => { const { error } = await this.sb.from('notificaciones_staff').update({ leida: true }).eq('id', id); if (error) throw error; }); }
  markAllRead(orgId: string) { return this.run(async () => { const { error } = await this.sb.from('notificaciones_staff').update({ leida: true }).eq('organizacion_id', orgId).eq('leida', false); if (error) throw error; }); }
  remove(id: string) { return this.run(async () => { const { error } = await this.sb.from('notificaciones_staff').delete().eq('id', id); if (error) throw error; }); }
  removeRead(orgId: string) { return this.run(async () => { const { error } = await this.sb.from('notificaciones_staff').delete().eq('organizacion_id', orgId).eq('leida', true); if (error) throw error; }); }
}
