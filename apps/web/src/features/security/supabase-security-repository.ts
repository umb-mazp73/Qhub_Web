import type { SupabaseClient } from '@supabase/supabase-js';
import { err, type Failure, failureFromSupabase, ok, type Result, unauthorizedFailure, forbiddenFailure } from '@qhub/core';
import { invokeFunction } from '@/shared/invoke-function';
import type { AccessInfo, ActivityItem, AssuranceState, MfaEnrollment, MfaFactor, SecurityRepository } from './security';

type Row = Record<string, unknown>;

export class SupabaseSecurityRepository implements SecurityRepository {
  constructor(private readonly sb: SupabaseClient) {}

  private async run<T>(body: () => Promise<T>): Promise<Result<T>> {
    try { return ok(await body()); } catch (e) { return err(failureFromSupabase(e) as Failure); }
  }


  /** Pasa por la función `qhub-recover`: si la persona es parte de un equipo, el administrador debe aprobarlo antes de que salga el correo. */
  requestPasswordReset(email: string) {
    return this.run(async () => {
      const r = await invokeFunction<{ ok: boolean }>(this.sb, 'qhub-recover', { email: email.trim() });
      if (!r.ok) throw r.failure;
    });
  }

  /**
   * Cambia la contraseña. Si la base lo rechaza por dentro (un integrante del equipo sin el permiso de su administrador), Auth responde con un
   * error del servidor sin detalle: se dice lo que de verdad pasó en vez de culpar a la contraseña.
   */
  private async updatePassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (!error) return;
    if ((error as { status?: number }).status !== undefined && (error as { status: number }).status >= 500) throw forbiddenFailure('Tu administrador debe aprobar este cambio. Envíale una solicitud desde Mi perfil → Seguridad.');
    throw error;
  }
  setPassword(password: string) { return this.run(() => this.updatePassword(password)); }

  changePassword(email: string, current: string, next: string) {
    return this.run(async () => {
      const { error: e1 } = await this.sb.auth.signInWithPassword({ email, password: current });
      if (e1) throw unauthorizedFailure('La contraseña actual no es correcta.');
      await this.updatePassword(next);
    });
  }

  signOutOthers() { return this.run(async () => { const { error } = await this.sb.auth.signOut({ scope: 'others' }); if (error) throw error; }); }

  mfaFactors() {
    return this.run(async () => {
      const { data, error } = await this.sb.auth.mfa.listFactors();
      if (error) throw error;
      return [...data.all].filter((f) => f.factor_type === 'totp')
        .map((f): MfaFactor => ({ id: f.id, name: f.friendly_name ?? 'App autenticadora', verified: f.status === 'verified', createdAt: new Date(f.created_at) }));
    });
  }

  mfaEnroll(name: string) {
    return this.run(async (): Promise<MfaEnrollment> => {
      // Un enrolamiento a medias (sin verificar) estorba: se limpia antes de empezar otro.
      const { data: list } = await this.sb.auth.mfa.listFactors();
      for (const f of list?.all ?? []) if (f.factor_type === 'totp' && f.status !== 'verified') await this.sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await this.sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `${name} · ${new Date().toISOString().slice(0, 10)}` });
      if (error) throw error;
      return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
    });
  }

  mfaConfirm(factorId: string, code: string) { return this.run(async () => { const { error } = await this.sb.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') }); if (error) throw error; }); }
  mfaRemove(factorId: string) { return this.run(async () => { const { error } = await this.sb.auth.mfa.unenroll({ factorId }); if (error) throw error; }); }
  mfaVerify(factorId: string, code: string) { return this.mfaConfirm(factorId, code); }

  assurance() {
    return this.run(async (): Promise<AssuranceState> => {
      const { data, error } = await this.sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return { current: data.currentLevel === 'aal2' ? 'aal2' : 'aal1', next: data.nextLevel === 'aal2' ? 'aal2' : 'aal1' };
    });
  }

  changeEmail(email: string) { return this.run(async () => { const { error } = await this.sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: `${window.location.origin}/perfil` }); if (error) throw error; }); }
  signOutEverywhere() { return this.run(async () => { const { error } = await this.sb.auth.signOut({ scope: 'global' }); if (error) throw error; }); }

  access() {
    return this.run(async (): Promise<AccessInfo> => {
      const { data, error } = await this.sb.auth.getUser();
      if (error) throw error;
      const u = data.user;
      if (!u) throw unauthorizedFailure();
      return { lastSignInAt: u.last_sign_in_at ? new Date(u.last_sign_in_at) : null, createdAt: u.created_at ? new Date(u.created_at) : null,
        provider: String((u.app_metadata as Row | undefined)?.provider ?? 'email'), emailConfirmed: !!u.email_confirmed_at, pendingEmail: (u.new_email as string | undefined) ?? null };
    });
  }

  activity(orgId: string, limit = 8) {
    return this.run(async () => {
      const { data: u } = await this.sb.auth.getUser();
      if (!u.user) throw unauthorizedFailure();
      const { data, error } = await this.sb.from('auditoria').select('id, accion, entidad, creada_en').eq('organizacion_id', orgId).eq('usuario_id', u.user.id).order('creada_en', { ascending: false }).limit(limit);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r): ActivityItem => ({ id: Number(r.id), action: String(r.accion), entity: (r.entidad as string | null) ?? null, createdAt: new Date(String(r.creada_en)) }));
    });
  }
}
