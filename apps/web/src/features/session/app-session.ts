import { isFailure, unauthorizedFailure, type Failure } from '@qhub/core';
import type { ApiContext, AuthRepository, RegisterInput } from '@qhub/api-client';
import type { ConnectToQhub, ConnectionState } from '@/features/qhub/connection';
import type { QhubLinkRepository } from '@/features/qhub/link';
import { can, toActorRole, type Membership, type StaffRepository, type StaffUser } from '@/features/staff';
import { mfaRequired, type SecurityRepository } from '@/features/security/security';

/** Marca en sessionStorage que a esta persona la quitaron del equipo; el inicio de sesión la lee y la borra. */
export const REMOVED_KEY = 'qhub.removed';

export type Loadable<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; failure: Failure };

/** Verificación en dos pasos: `checking` mientras se consulta, `required` si falta el código de la app autenticadora. */
export type MfaState = 'checking' | 'ok' | 'required';

export interface SessionSnapshot {
  auth: Loadable<StaffUser | null>;
  mfa: MfaState;
  memberships: Loadable<Membership[]>;
  connection: ConnectionState;
}

/** Estado de sesión de toda la app: quién es el staff, a qué organización pertenece y si hay conexión con la API Qhub. */
export class AppSession {
  private snap: SessionSnapshot = { auth: { status: 'loading' }, mfa: 'checking', memberships: { status: 'loading' }, connection: { status: 'disconnected' } };
  private readonly listeners = new Set<() => void>();
  private stopAuth: (() => void) | null = null;
  private recovering = false;
  /** Contraseña con la que la persona acaba de iniciar sesión, solo en memoria y solo hasta crear/conectar su cuenta Qhub. Nunca se guarda. */
  private pendingPassword: string | null = null;
  /** Se avisa cuando la conexión se renovó sola (p. ej. venció el token): la app vuelve a pedir sus datos. */
  onReconnected: (() => void) | null = null;

  constructor(private readonly staff: StaffRepository, private readonly connectUc: ConnectToQhub, private readonly context: ApiContext, private readonly security?: SecurityRepository, private readonly qhubLink?: QhubLinkRepository, private readonly qhubAuth?: AuthRepository) {
    this.context.onUnauthorized = () => { void this.onUnauthorized(); };
  }

  // useSyncExternalStore
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;
  private set(p: Partial<SessionSnapshot>) { this.snap = { ...this.snap, ...p }; this.listeners.forEach((l) => l()); }

  get user(): StaffUser | null { return this.snap.auth.status === 'ready' ? this.snap.auth.value : null; }
  get membership(): Membership | null {
    return this.snap.memberships.status === 'ready' ? (this.snap.memberships.value[0] ?? null) : null;
  }

  /** Aviso de que cambió la persona con sesión (otra cuenta, o salió): quien guarde datos por cuenta debe vaciarlos. */
  private userListeners = new Set<() => void>();
  onUserChange = (l: () => void) => { this.userListeners.add(l); return () => { this.userListeners.delete(l); }; };

  start() {
    this.stopAuth?.();
    this.stopAuth = this.staff.onAuthChange((u) => {
      const prev = this.user;
      if ((prev?.id ?? null) !== (u?.id ?? null)) this.userListeners.forEach((l) => l());
      if (!u) {
        this.disconnect();
        this.set({ auth: { status: 'ready', value: null }, memberships: { status: 'ready', value: [] }, mfa: 'ok' });
      } else if (prev?.id !== u.id) {
        // Otra cuenta inició sesión (por ejemplo en otra pestaña): se suelta todo lo de la cuenta anterior —conexión con Qhub incluida— y se carga la nueva.
        if (prev) this.disconnect();
        // Todo en un solo paso: si primero apareciera «con sesión» con las organizaciones de antes (vacías), la puerta de acceso
        // mandaría un instante a «Configura tu cuenta» aunque la persona ya tenga una.
        this.set({ auth: { status: 'ready', value: u }, mfa: 'checking', memberships: { status: 'loading' } });
        void this.afterSignIn();
      } else {
        this.set({ auth: { status: 'ready', value: u } });
      }
    });
  }
  stop() { this.stopAuth?.(); this.stopAuth = null; }

  /** Tras iniciar sesión: si la cuenta tiene verificación en dos pasos y falta el código, no se carga nada hasta pedirlo. */
  private async afterSignIn() {
    const a = this.security ? await this.security.assurance() : null;
    if (a?.ok && mfaRequired(a.value)) { this.set({ mfa: 'required' }); return; }
    this.set({ mfa: 'ok' });
    await this.loadMemberships();
  }

  /** El código de la app autenticadora ya se verificó: continúa la carga normal. */
  async completeMfa() {
    this.set({ mfa: 'ok', memberships: { status: 'loading' } });
    await this.loadMemberships();
  }

  /** Quitaron a esta persona del equipo (o le quitaron el acceso): se cierra su sesión y el inicio de sesión se lo explica. */
  private async expel() {
    try { sessionStorage.setItem(REMOVED_KEY, '1'); } catch { /* sin storage */ }
    await this.signOut();
  }

  /** Comprueba, sin recargar nada, que la persona siga en su organización con acceso. Si ya no, la saca. Los errores de red se ignoran. */
  async checkStillMember() {
    if (!this.user || this.snap.memberships.status !== 'ready' || this.snap.memberships.value.length === 0) return;
    const r = await this.staff.memberships();
    // Sin organización, o la cuenta ya no existe (al quitarla del equipo se borra): se cierra la sesión.
    if (this.user && ((r.ok && r.value.length === 0) || (!r.ok && r.failure.kind === 'unauthorized'))) await this.expel();
  }

  async loadMemberships() {
    // Si ya hay datos se conservan mientras se recargan (así la pantalla no parpadea ni se reinicia).
    if (this.snap.memberships.status !== 'ready') this.set({ memberships: { status: 'loading' } });
    const had = this.snap.memberships.status === 'ready' && this.snap.memberships.value.length > 0;
    const r = await this.staff.memberships();
    if (had && r.ok && r.value.length === 0) { await this.expel(); return; }
    const patch: Partial<SessionSnapshot> = { memberships: r.ok ? { status: 'ready', value: r.value } : { status: 'error', failure: r.failure } };
    // La conexión con Qhub se decide en el mismo instante que llegan las organizaciones (así no se pasa por la pantalla de conectar).
    const m = r.ok ? (r.value[0] ?? null) : null; const u = this.user;
    let auto = false;
    if (m && u && this.snap.connection.status !== 'connected') {
      const exp = this.connectUc.restore({ orgId: m.organization.id, actor: { userId: u.id, role: toActorRole(m.role) } });
      if (exp) patch.connection = { status: 'connected', expiresAt: exp };
      else if (m.organization.linked || await this.connectUc.hasDeviceConnection(m.organization.id)) { patch.connection = { status: 'connecting', auto: true }; auto = true; }   // conexión guardada (servidor o este dispositivo): no se pide nada
    }
    const provision = !patch.connection && !auto && this.snap.connection.status !== 'connected' && m && u && can(m.role, 'settings.manage') && this.pendingPassword;
    if (provision) patch.connection = { status: 'connecting', auto: true };
    this.set(patch);
    if (auto) void this.autoConnect();
    if (provision) void this.provisionQhub(m, u);
    else if (m) this.pendingPassword = null;     // ya no hace falta (o no le toca): no se conserva
  }

  /**
   * Cambió la contraseña de la web: se cambia también la de la cuenta Qhub (mismo correo) y, si la conexión estaba guardada
   * (servidor o este dispositivo), se actualiza para que siga conectando sola. Si la cuenta Qhub tiene otra contraseña o no existe, no pasa nada.
   */
  async syncQhubPassword(email: string, current: string, next: string): Promise<boolean> {
    const m = this.membership;
    if (!this.qhubAuth || !m) return false;
    const r = await this.qhubAuth.changePassword(email, current, next);
    if (!r.ok) return false;
    if (m.organization.linked && this.qhubLink && can(m.role, 'settings.manage')) await this.qhubLink.connect(m.organization.id, email, next);
    if (await this.connectUc.hasDeviceConnection(m.organization.id)) await this.connectUc.saveOnDevice(m.organization.id, email, next);
    return true;
  }

  /** La contraseña con la que se inicia sesión en la web; sirve para crear/conectar la cuenta Qhub con el mismo correo y contraseña. */
  holdPassword(password: string | null) { this.pendingPassword = password; }

  /**
   * Una sola cuenta: con el correo y la contraseña de la web se entra a Qhub; si esa cuenta aún no existe, se crea con los datos
   * de la organización y se conecta. Si algo no cuadra (p. ej. ya hay una cuenta Qhub con otra contraseña), queda la pantalla de conectar.
   */
  private async provisionQhub(m: Membership, u: StaffUser) {
    const pw = this.pendingPassword; this.pendingPassword = null;
    if (!pw) return;
    const fail = (reason?: Failure) => this.set({ connection: { status: 'disconnected', ...(reason ? { reason } : {}) } });
    const first = await this.connect(u.email, pw);
    if (first.ok) return;
    const city = m.organization.city?.trim(); const country = m.organization.country?.trim();
    if (first.failure.kind !== 'unauthorized' || !this.qhubAuth || !city || !country) { fail(); return; }
    this.set({ connection: { status: 'connecting', auto: true } });
    const [firstName, ...rest] = (u.displayName?.trim() || '').split(/\s+/).filter(Boolean);
    const base = (u.email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 22).padEnd(3, 'x');
    for (let i = 0; i < 4; i++) {
      const username = i === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      const input: RegisterInput = {
        accountType: m.organization.kind === 'persona' ? 'usuario' : 'empresa', ...(m.organization.kind === 'persona' ? {} : { companyName: m.organization.name }),
        firstName: firstName ?? 'Usuario', lastName: rest.join(' ') || firstName || 'Qhub', username, email: u.email, password: pw, country, city, acceptedTerms: true,
      };
      const r = await this.qhubAuth.register(input);
      if (r.ok) { const c = await this.connect(username, pw); if (!c.ok) fail(); return; }
      if (r.failure.kind !== 'conflict') { fail(); return; }       // el correo ya existe en Qhub con otra contraseña: que la persona conecte a mano
    }
    fail();
  }

  /** Pide un token con la conexión guardada. Si no se puede, queda desconectado (y se pide conectar, con el motivo). */
  private async autoConnect(): Promise<boolean> {
    const m = this.membership; const u = this.user;
    if (!m || !u) return false;
    this.set({ connection: { status: 'connecting', auto: true } });
    const r = await this.connectUc.autoConnect({ orgId: m.organization.id, actor: { userId: u.id, role: toActorRole(m.role) }, useServer: m.organization.linked });
    this.set({ connection: r.ok ? { status: 'connected', expiresAt: r.value } : { status: 'disconnected', ...(r.failure.kind === 'not_found' ? {} : { reason: r.failure }) } });
    return r.ok;
  }

  /** Reconexión automática para quien NO es administrador: usa la conexión guardada en el servidor.
   *  Si falla, avisa a los administradores. Devuelve 'ok' (reconectó) | 'avisado' (no reconectó, se avisó al admin) | 'error' (sin sesión/organización). */
  async autoReconnectOrNotify(): Promise<'ok' | 'avisado' | 'error'> {
    const m = this.membership; const u = this.user;
    if (!m || !u) return 'error';
    this.connectUc.disconnect(m.organization.id);                 // descarta el token caduco antes de reintentar (igual que onUnauthorized)
    this.set({ connection: { status: 'connecting', auto: true } });
    const r = await this.connectUc.autoConnect({ orgId: m.organization.id, actor: { userId: u.id, role: toActorRole(m.role) }, useServer: true });
    if (r.ok) { this.set({ connection: { status: 'connected', expiresAt: r.value } }); this.onReconnected?.(); return 'ok'; }
    this.set({ connection: { status: 'disconnected', ...(r.failure.kind === 'not_found' ? {} : { reason: r.failure }) } });
    if (this.qhubLink) await this.qhubLink.notifyReconnectNeeded(m.organization.id);  // best-effort
    return 'avisado';
  }

  /**
   * Conecta con la cuenta Qhub. Con `remember` (por defecto) y siendo administrador, la conexión se guarda en el servidor
   * para no volver a pedirla. Si el servidor no puede, queda guardada cifrada en este dispositivo. `saved` dice dónde quedó (`false` si no).
   */
  async connect(identifier: string, password: string, opts: { remember?: boolean } = {}) {
    const m = this.membership; const u = this.user;
    if (!m || !u) return { ok: false as const, failure: unauthorizedFailure() };
    this.set({ connection: { status: 'connecting' } });
    const r = await this.connectUc.login({ orgId: m.organization.id, actor: { userId: u.id, role: toActorRole(m.role) }, identifier, password });
    if (!r.ok) { this.set({ connection: { status: 'disconnected', reason: r.failure } }); return { ok: false as const, failure: r.failure }; }
    if (can(m.role, 'settings.manage') && !m.organization.qhubConnected) {      // primera vez: queda registrado en la base de datos
      if ((await this.staff.confirmQhubConnection(m.organization.id)).ok) await this.loadMemberships();
    }
    let saved: 'servidor' | 'dispositivo' | false = false;
    let saveFailure: Failure | undefined;
    if (opts.remember ?? true) {
      if (this.qhubLink && can(m.role, 'settings.manage')) {          // lo mejor: en el servidor (sirve en cualquier equipo)
        const s = await this.qhubLink.connect(m.organization.id, identifier, password);
        if (s.ok) { saved = 'servidor'; await this.loadMemberships(); }   // `linked` pasa a verdadero
        else saveFailure = s.failure;
      }
      if (!saved && await this.connectUc.saveOnDevice(m.organization.id, identifier, password)) saved = 'dispositivo';   // si el servidor no puede: en este dispositivo
    }
    this.set({ connection: { status: 'connected', expiresAt: r.value } });
    return { ok: true as const, saved, ...(saveFailure ? { saveFailure } : {}) };
  }

  disconnect() {
    this.connectUc.disconnect(this.membership?.organization.id);
    this.set({ connection: { status: 'disconnected' } });
  }

  /** Borra la conexión guardada en este dispositivo y sale de la conexión actual (la del servidor se olvida desde Ajustes). */
  async forgetDeviceConnection() {
    const id = this.membership?.organization.id;
    if (id) await this.connectUc.forgetDevice(id);
    this.disconnect();
  }
  hasDeviceConnection(): Promise<boolean> { const id = this.membership?.organization.id; return id ? this.connectUc.hasDeviceConnection(id) : Promise.resolve(false); }

  async signOut() { this.pendingPassword = null; this.disconnect(); await this.staff.signOut(); }

  /** 401 en un endpoint de negocio (el token venció; la API no tiene refresh): si hay conexión guardada se renueva sola; si no, se pide conectar. */
  private async onUnauthorized() {
    if (this.recovering || this.snap.connection.status !== 'connected') return;
    this.recovering = true;
    try {
      this.connectUc.disconnect(this.membership?.organization.id);
      if (this.membership?.organization.linked && await this.autoConnect()) { this.onReconnected?.(); return; }
      this.set({ connection: { status: 'disconnected', reason: unauthorizedFailure() } });
    } finally { this.recovering = false; }
  }
}

export const failureOf = (e: unknown): Failure | null => (isFailure(e) ? e : null);
