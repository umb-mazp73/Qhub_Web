import { isFailure, unauthorizedFailure, type Failure } from '@qhub/core';
import type { ApiContext } from '@qhub/api-client';
import type { ConnectToQhub, ConnectionState } from '@/features/qhub/connection';
import type { QhubLinkRepository } from '@/features/qhub/link';
import { can, toActorRole, type Membership, type StaffRepository, type StaffUser } from '@/features/staff';
import { mfaRequired, type SecurityRepository } from '@/features/security/security';

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
  /** Se avisa cuando la conexión se renovó sola (p. ej. venció el token): la app vuelve a pedir sus datos. */
  onReconnected: (() => void) | null = null;

  constructor(private readonly staff: StaffRepository, private readonly connectUc: ConnectToQhub, private readonly context: ApiContext, private readonly security?: SecurityRepository, private readonly qhubLink?: QhubLinkRepository) {
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

  async loadMemberships() {
    // Si ya hay datos se conservan mientras se recargan (así la pantalla no parpadea ni se reinicia).
    if (this.snap.memberships.status !== 'ready') this.set({ memberships: { status: 'loading' } });
    const r = await this.staff.memberships();
    const patch: Partial<SessionSnapshot> = { memberships: r.ok ? { status: 'ready', value: r.value } : { status: 'error', failure: r.failure } };
    // La conexión con Qhub se decide en el mismo instante que llegan las organizaciones (así no se pasa por la pantalla de conectar).
    const m = r.ok ? (r.value[0] ?? null) : null; const u = this.user;
    let auto = false;
    if (m && u && this.snap.connection.status !== 'connected') {
      const exp = this.connectUc.restore({ orgId: m.organization.id, actor: { userId: u.id, role: toActorRole(m.role) } });
      if (exp) patch.connection = { status: 'connected', expiresAt: exp };
      else if (m.organization.linked || await this.connectUc.hasDeviceConnection(m.organization.id)) { patch.connection = { status: 'connecting', auto: true }; auto = true; }   // conexión guardada (servidor o este dispositivo): no se pide nada
    }
    this.set(patch);
    if (auto) void this.autoConnect();
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

  async signOut() { this.disconnect(); await this.staff.signOut(); }

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
