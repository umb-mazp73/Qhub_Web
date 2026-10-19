import type { SupabaseClient, User } from '@supabase/supabase-js';
import { badRequestFailure, conflictFailure, err, type Failure, failureFromSupabase, forbiddenFailure, isFailure, networkFailure, notFoundFailure, ok, rateLimitedFailure, type Result, serverFailure, unauthorizedFailure, unknownFailure, validationFailure } from '@qhub/core';
import { invokeFunction } from '@/shared/invoke-function';
import { effectiveRole, parseOrgRole, type AccountKind, type Invitation, type InvitationPreview, type MemberProfile, type MemberRequest, type RequestRecord, type RequestOutcome, type MyPermission, type PermissionStatus, type RequestType, type InviteProfile, type InviteResult, type Member, type Membership, type OrgRole, type Organization, type Profile, type StaffRepository, type StaffUser } from '.';

type Row = Record<string, unknown>;

/** Adaptador Supabase. Traduce errores a Failure; la UI no ve errores de Supabase. */
export class SupabaseStaffRepository implements StaffRepository {
  constructor(private readonly sb: SupabaseClient) {}

  private toUser(u: User | null | undefined): StaffUser | null {
    if (!u) return null;
    const meta = u.user_metadata as Row | undefined;
    const name = [meta?.nombre, meta?.apellido].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' ').trim();
    const assigned = (u.app_metadata as Row | undefined)?.clave_asignada === true;
    return { id: u.id, email: u.email ?? '', ...(name ? { displayName: name } : {}), ...(assigned ? { passwordAssigned: true } : {}) };
  }

  private async run<T>(body: () => Promise<T>): Promise<Result<T>> {
    try { return ok(await body()); } catch (e) { return err(failureFromSupabase(e)); }
  }

  /** supabase-js devuelve `{data, error}`: se convierte en excepción para unificar el manejo. */
  private async q<T = unknown>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
    const { data, error } = await p;
    if (error) throw error;
    return data as T;
  }

  async currentUser() { const { data } = await this.sb.auth.getUser(); return this.toUser(data.user); }

  onAuthChange(cb: (u: StaffUser | null) => void): () => void {
    void this.sb.auth.getSession().then(({ data }) => cb(this.toUser(data.session?.user)));
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => cb(this.toUser(session?.user)));
    return () => data.subscription.unsubscribe();
  }

  signIn(email: string, password: string) {
    return this.run(async () => {
      const d = await this.q<{ user: User }>(this.sb.auth.signInWithPassword({ email: email.trim(), password }));
      return this.toUser(d.user)!;
    });
  }

  signUp(input: { email: string; password: string; firstName: string; lastName: string }) {
    return this.run(async () => {
      const d = await this.q<{ user: User | null; session: unknown }>(this.sb.auth.signUp({ email: input.email.trim(), password: input.password, options: { data: { nombre: input.firstName.trim(), apellido: input.lastName.trim() } } }));
      // Con la confirmación por correo activada, Supabase no da error si el correo existe: devuelve un usuario sin identidades.
      if (d.user && Array.isArray((d.user as User).identities) && (d.user as User).identities!.length === 0) throw conflictFailure('Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.');
      return d.session ? this.toUser(d.user) : null;
    });
  }

  signOut() { return this.run(async () => { await this.q(this.sb.auth.signOut().then((r) => ({ data: null, error: r.error }))); }); }

  private profileOf(r: Row): Profile {
    const s = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '');
    return { firstName: s('nombre'), lastName: s('apellido'), phone: s('telefono'), jobTitle: s('cargo'), country: s('pais'), city: s('ciudad'), timeZone: s('zona_horaria') };
  }
  profile() {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      if (!u.user) throw unauthorizedFailure();
      return this.profileOf(await this.q<Row>(this.sb.from('perfiles').select('nombre, apellido, telefono, cargo, pais, ciudad, zona_horaria').eq('id', u.user.id).single() as unknown as PromiseLike<{ data: Row; error: unknown }>));
    });
  }
  updateProfile(p: Profile) {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      if (!u.user) throw unauthorizedFailure();
      const n = (v: string) => (v.trim() ? v.trim() : null);
      const row = await this.q<Row>(this.sb.from('perfiles').update({ nombre: n(p.firstName), apellido: n(p.lastName), telefono: n(p.phone), cargo: n(p.jobTitle), pais: n(p.country), ciudad: n(p.city), zona_horaria: n(p.timeZone) })
        .eq('id', u.user.id).select('nombre, apellido, telefono, cargo, pais, ciudad, zona_horaria').single() as unknown as PromiseLike<{ data: Row; error: unknown }>);
      // El nombre también vive en los metadatos de auth (lo muestra la cabecera).
      await this.sb.auth.updateUser({ data: { nombre: p.firstName.trim(), apellido: p.lastName.trim() } });
      return this.profileOf(row);
    });
  }
  deleteAccount() {
    return this.run(async () => {
      await this.q(this.sb.rpc('eliminar_mi_cuenta') as unknown as PromiseLike<{ data: unknown; error: unknown }>);
      await this.sb.auth.signOut({ scope: 'local' });
    });
  }

  private org(j: Row): Organization {
    return { id: String(j.id), code: String(j.codigo ?? ''), kind: j.tipo === 'persona' ? 'persona' : 'empresa', qhubConnected: Boolean(j.qhub_conectada_en), name: String(j.nombre), slug: String(j.slug), timeZone: String(j.zona_horaria ?? 'America/Guayaquil'), city: (j.ciudad as string | null) ?? null, country: (j.pais as string | null) ?? null, published: Boolean(j.publica), linked: Boolean(j.vinculada) };
  }

  memberships() {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      if (!u.user) throw unauthorizedFailure();
      const rows = await this.q<Row[]>(this.sb.from('miembros').select('rol, activo, organizaciones(*)').eq('usuario_id', u.user.id).eq('activo', true) as unknown as PromiseLike<{ data: Row[]; error: unknown }>);
      return rows.filter((r) => r.organizaciones && typeof r.organizaciones === 'object')
        .map((r): Membership => { const organization = this.org(r.organizaciones as Row); return { organization, role: effectiveRole(parseOrgRole(r.rol), organization.kind) }; });
    });
  }

  createOrganization(i: { name: string; slug: string; kind?: AccountKind; city?: string; country?: string; timeZone?: string }) {
    return this.run(async () => String(await this.q(this.sb.rpc('crear_organizacion', { p_nombre: i.name.trim(), p_slug: i.slug, p_ciudad: i.city ?? null, p_pais: i.country ?? null, p_zona_horaria: i.timeZone ?? 'America/Guayaquil', p_tipo: i.kind ?? 'empresa' }))));
  }
  confirmQhubConnection(orgId: string) { return this.run(async () => { await this.q(this.sb.rpc('confirmar_conexion_qhub', { p_org: orgId }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); }); }
  acceptInvitation(token: string) { return this.run(async () => String(await this.q(this.sb.rpc('aceptar_invitacion', { p_token: token.trim() })))); }

  updateOrganization(id: string, patch: { name?: string; city?: string; country?: string }) {
    return this.run(async () => {
      const body: Row = {};
      if (patch.name !== undefined) body.nombre = patch.name;
      if (patch.city !== undefined) body.ciudad = patch.city;
      if (patch.country !== undefined) body.pais = patch.country;
      return this.org(await this.q<Row>(this.sb.from('organizaciones').update(body).eq('id', id).select().single() as unknown as PromiseLike<{ data: Row; error: unknown }>));
    });
  }

  members(orgId: string) {
    return this.run(async () => {
      const rows = await this.q<Row[]>(this.sb.from('miembros').select('usuario_id, rol, activo, perfiles(nombre, apellido)').eq('organizacion_id', orgId).order('creado_en') as unknown as PromiseLike<{ data: Row[]; error: unknown }>);
      return rows.map((r): Member => {
        const p = r.perfiles as Row | undefined;
        const name = `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim();
        return { userId: String(r.usuario_id), name: name || 'Sin nombre', role: parseOrgRole(r.rol), active: Boolean(r.activo) };
      });
    });
  }

  updateMember(orgId: string, userId: string, patch: { role?: OrgRole; active?: boolean }) {
    return this.run(async () => {
      const body: Row = {};
      if (patch.role) body.rol = patch.role;
      if (patch.active !== undefined) body.activo = patch.active;
      await this.q(this.sb.from('miembros').update(body).eq('organizacion_id', orgId).eq('usuario_id', userId) as unknown as PromiseLike<{ data: unknown; error: unknown }>);
    });
  }

  memberProfile(orgId: string, userId: string) {
    return this.run(async (): Promise<MemberProfile> => {
      const rows = await this.q<Row[]>(this.sb.rpc('perfil_de_miembro', { p_org: orgId, p_usuario: userId }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>);
      const j = rows[0] ?? {};
      const t = (v: unknown) => (typeof v === 'string' ? v : '');
      return { firstName: t(j.nombre), lastName: t(j.apellido), position: t(j.cargo), phone: t(j.telefono), email: t(j.email) };
    });
  }
  editMember(orgId: string, userId: string, p: { firstName: string; lastName: string; position: string; phone: string }) {
    return this.run(async () => { await this.q(this.sb.rpc('editar_miembro', { p_org: orgId, p_usuario: userId, p_nombre: p.firstName, p_apellido: p.lastName, p_cargo: p.position, p_telefono: p.phone }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }
  removeMember(orgId: string, userId: string) {
    return this.run(async () => { await this.q(this.sb.rpc('quitar_miembro', { p_org: orgId, p_usuario: userId }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }

  requestChange(orgId: string, type: RequestType, reason: string) {
    return this.run(async () => { await this.q(this.sb.rpc('solicitar_cambio_miembro', { p_org: orgId, p_tipo: type, p_motivo: reason }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }
  pendingRequests(orgId: string) {
    return this.run(async () => (await this.q<Row[]>(this.sb.rpc('solicitudes_pendientes', { p_org: orgId }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>)).map((r): MemberRequest => ({
      id: String(r.id), userId: String(r.usuario_id), name: String(r.nombre ?? 'Una persona'), type: r.tipo === 'contrasena' ? 'contrasena' : r.tipo === 'correo' ? 'correo' : 'datos', reason: typeof r.motivo === 'string' ? r.motivo : null, createdAt: new Date(String(r.creada_en)),
    })));
  }
  respondRequest(id: string, approve: boolean) {
    return this.run(async () => { await this.q(this.sb.rpc('responder_solicitud_miembro', { p_id: id, p_aprobar: approve }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }
  requestHistory(orgId: string) {
    return this.run(async () => (await this.q<Row[]>(this.sb.rpc('historial_solicitudes', { p_org: orgId }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>)).map((r): RequestRecord => ({
      id: String(r.id), userId: String(r.usuario_id), name: String(r.nombre ?? 'Una persona'), type: r.tipo === 'contrasena' ? 'contrasena' : r.tipo === 'correo' ? 'correo' : 'datos',
      reason: typeof r.motivo === 'string' ? r.motivo : null, outcome: String(r.resultado) as RequestOutcome, requestedAt: new Date(String(r.creada_en)), answeredAt: r.respondida_en ? new Date(String(r.respondida_en)) : null,
    })));
  }
  myPermission(orgId: string, type: RequestType) {
    return this.run(async (): Promise<MyPermission | null> => {
      const r = (await this.q<Row[]>(this.sb.rpc('mi_permiso', { p_org: orgId, p_tipo: type }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>))[0];
      return r ? { status: String(r.estado) as PermissionStatus, expiresAt: r.vence_en ? new Date(String(r.vence_en)) : null } : null;
    });
  }
  spendPasswordPermission(orgId: string) {
    return this.run(async () => Boolean(await this.q(this.sb.rpc('usar_permiso_contrasena', { p_org: orgId }) as unknown as PromiseLike<{ data: unknown; error: unknown }>)));
  }

  private inv(j: Row): Invitation {
    const opt = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    return {
      id: String(j.id), email: String(j.email), role: parseOrgRole(j.rol), token: String(j.token), expiresAt: new Date(String(j.expira_en)), acceptedAt: j.aceptada_en ? new Date(String(j.aceptada_en)) : null,
      sentAt: j.enviada_en ? new Date(String(j.enviada_en)) : null,
      ...(opt(j.nombre) ? { firstName: opt(j.nombre) } : {}), ...(opt(j.apellido) ? { lastName: opt(j.apellido) } : {}), ...(opt(j.cargo) ? { position: opt(j.cargo) } : {}),
    };
  }
  private async sendInvite(body: Record<string, unknown>): Promise<Result<InviteResult>> {
    const r = await invokeFunction<{ invitacion: Row; enviado: boolean; motivo?: 'limite' | 'envio'; clave_asignada?: boolean }>(this.sb, 'qhub-invite', body);
    if (!r.ok) return r;
    return ok({ invitation: this.inv(r.value.invitacion), sent: r.value.enviado, passwordSet: r.value.clave_asignada === true, ...(r.value.motivo ? { reason: r.value.motivo } : {}) });
  }
  invite(orgId: string, i: { email: string; role: OrgRole; password?: string } & InviteProfile) {
    return this.sendInvite({ accion: 'enviar', organizacion_id: orgId, email: i.email, rol: i.role, password: i.password, nombre: i.firstName, apellido: i.lastName, cargo: i.position });
  }
  resendInvitation(orgId: string, invitationId: string) { return this.sendInvite({ accion: 'reenviar', organizacion_id: orgId, invitacion_id: invitationId }); }
  cancelInvitation(invitationId: string) {
    return this.run(async () => { await this.q(this.sb.from('invitaciones').delete().eq('id', invitationId).is('aceptada_en', null) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }
  initialPassword(token: string): Promise<Result<string | null>> {
    // La clave vive cifrada en reposo; la Edge Function `qhub-clave` autoriza y descifra. `200 { clave: null }` -> ok(null).
    return this.run(async () => {
      const r = await invokeFunction<{ clave: string | null }>(this.sb, 'qhub-clave', { token: token.trim() });
      if (!r.ok) throw r.failure;
      return r.value?.clave ?? null;
    });
  }
  previewInvitation(token: string) {
    return this.run(async (): Promise<InvitationPreview> => {
      const rows = await this.q<Row[]>(this.sb.rpc('ver_invitacion', { p_token: token.trim() }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>);
      const j = rows[0];
      if (!j) throw notFoundFailure('Esta invitación no es válida, ya venció o es para otro correo.');
      const opt = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
      return { organization: String(j.organizacion), kind: j.tipo === 'persona' ? 'persona' : 'empresa', role: parseOrgRole(j.rol), email: String(j.email), expiresAt: new Date(String(j.expira_en)),
        ...(opt(j.nombre) ? { firstName: opt(j.nombre) } : {}), ...(opt(j.apellido) ? { lastName: opt(j.apellido) } : {}), ...(opt(j.cargo) ? { position: opt(j.cargo) } : {}) };
    });
  }
  invitations(orgId: string) {
    return this.run(async () => (await this.q<Row[]>(this.sb.from('invitaciones').select().eq('organizacion_id', orgId).is('aceptada_en', null).order('creada_en', { ascending: false }) as unknown as PromiseLike<{ data: Row[]; error: unknown }>)).map((r) => this.inv(r)));
  }

  queuePrefixes(orgId: string) {
    return this.run(async () => {
      const rows = await this.q<Row[]>(this.sb.from('cola_prefijos').select('qhub_cola_id, prefijo').eq('organizacion_id', orgId) as unknown as PromiseLike<{ data: Row[]; error: unknown }>);
      return Object.fromEntries(rows.map((r) => [String(r.qhub_cola_id), String(r.prefijo)]));
    });
  }
  setQueuePrefix(orgId: string, queueId: string, prefix: string) {
    return this.run(async () => { await this.q(this.sb.from('cola_prefijos').upsert({ organizacion_id: orgId, qhub_cola_id: queueId, prefijo: prefix.toUpperCase() }) as unknown as PromiseLike<{ data: unknown; error: unknown }>); });
  }
  audit(orgId: string, action: string, extra: { entity?: string; entityId?: string; detail?: Record<string, unknown> } = {}) {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      await this.q(this.sb.from('auditoria').insert({ organizacion_id: orgId, usuario_id: u.user?.id, accion: action, entidad: extra.entity ?? null, entidad_id: extra.entityId ?? null, detalle: extra.detail ?? {} }) as unknown as PromiseLike<{ data: unknown; error: unknown }>);
    });
  }
}
