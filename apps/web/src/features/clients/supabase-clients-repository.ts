import type { SupabaseClient } from '@supabase/supabase-js';
import { err, type Failure, failureFromSupabase, ok, type Result } from '@qhub/core';
import type { BlockedInfo, Client, EditPermission, EditPermissionStatus, ClientsRepository, ClientTicket } from './clients';

type Row = Record<string, unknown>;
const d = (v: unknown) => (v ? new Date(String(v)) : null);
const s = (v: unknown) => (typeof v === 'string' ? v : '');

export class SupabaseClientsRepository implements ClientsRepository {
  constructor(private readonly sb: SupabaseClient) {}

  private async run<T>(body: () => Promise<T>): Promise<Result<T>> {
    try { return ok(await body()); } catch (e) { return err(failureFromSupabase(e) as Failure); }
  }

  list(orgId: string) {
    return this.run(async () => {
      const { data, error } = await this.sb.rpc('clientes_organizacion', { p_org: orgId });
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r): Client => ({
        userId: String(r.usuario_id), firstName: s(r.nombre), lastName: s(r.apellido), email: (r.email as string | null) ?? null, phone: (r.telefono as string | null) ?? null,
        firstSeen: d(r.primera_vez), lastTicket: d(r.ultimo_turno), tickets: Number(r.turnos ?? 0), served: Number(r.atendidos ?? 0), noShow: Number(r.no_show ?? 0),
        cancelled: Number(r.cancelados ?? 0), follows: Boolean(r.sigue), blocked: Boolean(r.bloqueado),
      }));
    });
  }

  history(orgId: string, userId: string, limit = 50) {
    return this.run(async () => {
      const { data, error } = await this.sb.from('historial_turnos').select('id, cola_nombre, numero, estado, creado_en').eq('organizacion_id', orgId).eq('usuario_id', userId).order('creado_en', { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r): ClientTicket => ({ id: String(r.id), queueName: (r.cola_nombre as string | null) ?? null, number: typeof r.numero === 'number' ? r.numero : null, status: s(r.estado), createdAt: new Date(String(r.creado_en)) }));
    });
  }

  block(orgId: string, userId: string, reason: string) {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      const { error } = await this.sb.from('clientes_bloqueados').upsert({ organizacion_id: orgId, usuario_id: userId, motivo: reason.trim() || null, bloqueado_por: u.user?.id });
      if (error) throw error;
    });
  }
  unblock(orgId: string, userId: string) {
    return this.run(async () => { const { error } = await this.sb.from('clientes_bloqueados').delete().eq('organizacion_id', orgId).eq('usuario_id', userId); if (error) throw error; });
  }
  blockInfo(orgId: string, userId: string) {
    return this.run(async (): Promise<BlockedInfo | null> => {
      const { data, error } = await this.sb.from('clientes_bloqueados').select('motivo, creado_en').eq('organizacion_id', orgId).eq('usuario_id', userId).maybeSingle();
      if (error) throw error;
      return data ? { reason: ((data as Row).motivo as string | null) ?? null, createdAt: new Date(String((data as Row).creado_en)) } : null;
    });
  }

  private rpc(fn: string, args: Row) {
    return this.run(async () => { const { error } = await this.sb.rpc(fn, args); if (error) throw error; });
  }
  remove(orgId: string, userId: string) { return this.rpc('eliminar_cliente', { p_org: orgId, p_cliente: userId }); }
  requestEdit(orgId: string, userId: string, reason: string) { return this.rpc('solicitar_edicion_cliente', { p_org: orgId, p_cliente: userId, p_motivo: reason }); }
  edit(orgId: string, userId: string, data: { firstName: string; lastName: string; phone: string }) { return this.rpc('editar_cliente', { p_org: orgId, p_cliente: userId, p_nombre: data.firstName, p_apellido: data.lastName, p_telefono: data.phone }); }
  editPermission(orgId: string, userId: string) {
    return this.run(async (): Promise<EditPermission | null> => {
      const { data, error } = await this.sb.rpc('estado_edicion_cliente', { p_org: orgId, p_cliente: userId });
      if (error) throw error;
      const r = ((data ?? []) as Row[])[0];
      return r ? { status: s(r.estado) as EditPermissionStatus, requestedAt: new Date(String(r.creada_en)), expiresAt: d(r.vence_en) } : null;
    });
  }
}
