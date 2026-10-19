import { ok, err, conflictFailure, notFoundFailure, type Failure, type Result } from '@qhub/core';
import {
  ApiContext, type AppNotification, type AuthRepository, type AuthToken, type CreateQueueInput, type HealthRepository, type NotificationRepository, type Queue, type QueueEvent,
  type QueueLimit, type QueueRepository, type QueueState, type QueueSubscription, type RealtimeRepository, type RegisterInput, type Registration, type Schedule, type ScheduleInput,
  type Slot, type Ticket, type TicketFilter, type TicketRepository, type TicketStatus,
} from '@qhub/api-client';
import type { AppEnv } from '@/app/env';
import { buildTestSession } from './session';
import type { TokenStore } from '@/features/qhub/connection';
import { EMPTY_PROFILE, type Invitation, type InvitationPreview, type InviteProfile, type InviteResult, type Member, type MemberProfile, type MemberRequest, type RequestRecord, type MyPermission, type RequestType, type Membership, type OrgRole, type Organization, type Profile, type StaffRepository, type StaffUser } from '@/features/staff';

export const testEnv: AppEnv = { appEnv: 'production', apiBaseUrl: 'http://api.test', wsBaseUrl: 'ws://api.test', supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_test' };

export const org: Organization = { id: 'org1', code: 'QH-7K2M9X', kind: 'empresa', qhubConnected: false, name: 'Notaría 12', slug: 'notaria-12', timeZone: 'America/Guayaquil', published: false, linked: false };
export const ana: StaffUser = { id: 'u1', email: 'ana@x.co', displayName: 'Ana Gómez' };
export const adminMembership: Membership = { organization: org, role: 'admin' };
export const agentMembership: Membership = { organization: org, role: 'agente' };
export const personalOrg: Organization = { ...org, id: 'org-p', kind: 'persona', name: 'Dra. Ana Gómez' };
export const personalMembership: Membership = { organization: personalOrg, role: 'propietario' };
export const supervisorMembership: Membership = { organization: org, role: 'supervisor' };
export const receptionMembership: Membership = { organization: org, role: 'recepcion' };

export class FakeStaffRepository implements StaffRepository {
  user: StaffUser | null;
  membershipList: Membership[];
  listeners = new Set<(u: StaffUser | null) => void>();
  signInFailure: Failure | null = null;
  calls: string[] = [];
  prefixes: Record<string, string> = {};
  audits: string[] = [];
  invitationsList: Invitation[] = [];
  profileData: Profile = { ...EMPTY_PROFILE, firstName: 'Ana', lastName: 'Gómez', country: 'EC', city: 'Quito', timeZone: 'America/Guayaquil' };
  deleteFailure: Failure | null = null;

  constructor(o: { user?: StaffUser | null; memberships?: Membership[] } = {}) { this.user = o.user ?? null; this.membershipList = [...(o.memberships ?? [])]; }

  async currentUser() { return this.user; }
  onAuthChange(cb: (u: StaffUser | null) => void) { this.listeners.add(cb); cb(this.user); return () => { this.listeners.delete(cb); }; }
  private emit() { this.listeners.forEach((l) => l(this.user)); }

  async signIn(email: string): Promise<Result<StaffUser>> {
    this.calls.push(`signIn:${email}`);
    if (this.signInFailure) return err(this.signInFailure);
    this.user = { id: 'u1', email, displayName: 'Ana Gómez' };
    this.emit();
    return ok(this.user);
  }
  async signUp(i: { email: string }): Promise<Result<StaffUser | null>> { this.calls.push(`signUp:${i.email}`); return ok(null); }
  async signOut(): Promise<Result<void>> { this.calls.push('signOut'); this.user = null; this.emit(); return ok(undefined); }

  async profile(): Promise<Result<Profile>> { return ok({ ...this.profileData }); }
  async updateProfile(p: Profile): Promise<Result<Profile>> { this.calls.push(`updateProfile:${p.firstName}:${p.city}`); this.profileData = { ...p }; return ok(p); }
  async deleteAccount(): Promise<Result<void>> {
    this.calls.push('deleteAccount');
    if (this.deleteFailure) return err(this.deleteFailure);
    this.user = null; this.emit();
    return ok(undefined);
  }

  async memberships() { return ok([...this.membershipList]); }
  async createOrganization(i: { name: string; slug: string; kind?: 'persona' | 'empresa'; timeZone?: string }): Promise<Result<string>> {
    this.calls.push(`createOrg:${i.name}:${i.kind ?? 'empresa'}`);
    this.membershipList.push({ organization: { ...org, id: 'org-new', name: i.name, slug: i.slug, kind: i.kind ?? 'empresa' }, role: i.kind === 'persona' ? 'propietario' : 'admin' });
    return ok('org-new');
  }
  async confirmQhubConnection(orgId: string): Promise<Result<void>> {
    this.calls.push(`confirmQhub:${orgId}`);
    this.membershipList = this.membershipList.map((m) => (m.organization.id === orgId ? { ...m, organization: { ...m.organization, qhubConnected: true } } : m));
    return ok(undefined);
  }
  async acceptInvitation(token: string): Promise<Result<string>> {
    this.calls.push(`accept:${token}`);
    if (token === 'bad') return err(notFoundFailure('Invitación inválida, vencida o para otro correo'));
    this.membershipList.push(agentMembership);
    return ok('org1');
  }
  async updateOrganization(id: string, patch: { name?: string }): Promise<Result<Organization>> { this.calls.push(`updateOrg:${patch.name}`); return ok({ ...org, id, name: patch.name ?? org.name }); }
  async members(): Promise<Result<Member[]>> { return ok([{ userId: 'u1', name: 'Ana Gómez', role: 'admin', active: true }, { userId: 'u2', name: 'Luis Vera', role: 'agente', active: true }]); }
  async updateMember(_o: string, userId: string, p: { role?: OrgRole; active?: boolean }): Promise<Result<void>> { this.calls.push(`updateMember:${userId}:${p.role}:${p.active}`); return ok(undefined); }
  /** `false` simula que el correo no pudo salir (límite de envíos). */
  emailSends = true;
  /** Lo que ve la persona invitada con ese código; `null` = invitación inválida. */
  previews: Record<string, InvitationPreview | null> = {};
  async invite(_o: string, i: { email: string; role: OrgRole; password?: string } & InviteProfile): Promise<Result<InviteResult>> {
    this.calls.push(`invite:${i.email}:${i.role}${i.password ? ':conclave' : ''}`);
    if (i.email === 'miembro@x.co') return err(conflictFailure('Esa persona ya es parte del equipo.'));
    const inv: Invitation = { id: `i${this.invitationsList.length}`, email: i.email.toLowerCase(), role: i.role, token: `tok-${this.invitationsList.length}`, expiresAt: new Date(Date.now() + 7 * 864e5), acceptedAt: null, ...(i.firstName ? { firstName: i.firstName } : {}), ...(i.lastName ? { lastName: i.lastName } : {}), ...(i.position ? { position: i.position } : {}) };
    this.invitationsList = [...this.invitationsList.filter((x) => x.email !== inv.email), inv];
    return ok({ invitation: inv, sent: this.emailSends, passwordSet: !!i.password, ...(this.emailSends ? {} : { reason: 'limite' as const }) });
  }
  async resendInvitation(_o: string, id: string): Promise<Result<InviteResult>> {
    this.calls.push(`resend:${id}`);
    const inv = this.invitationsList.find((x) => x.id === id);
    return inv ? ok({ invitation: inv, sent: this.emailSends }) : err(notFoundFailure('Esa invitación ya no existe.'));
  }
  async cancelInvitation(id: string): Promise<Result<void>> { this.calls.push(`cancel:${id}`); this.invitationsList = this.invitationsList.filter((x) => x.id !== id); return ok(undefined); }
  initialPasswords: Record<string, string> = {};
  async initialPassword(token: string): Promise<Result<string | null>> { return ok(this.initialPasswords[token] ?? null); }
  async previewInvitation(token: string): Promise<Result<InvitationPreview>> {
    this.calls.push(`preview:${token}`);
    const p = this.previews[token];
    return p ? ok(p) : err(notFoundFailure('Esta invitación no es válida, ya venció o es para otro correo.'));
  }
  memberProfiles: Record<string, MemberProfile> = { u2: { firstName: 'Luis', lastName: 'Vera', position: 'Caja', phone: '+593 99 111 2222', email: 'luis@x.co' } };
  async memberProfile(_o: string, userId: string): Promise<Result<MemberProfile>> { this.calls.push(`memberProfile:${userId}`); const p = this.memberProfiles[userId]; return p ? ok({ ...p }) : err(notFoundFailure('No encontramos a esa persona en tu equipo.')); }
  async editMember(_o: string, userId: string, p: { firstName: string; lastName: string; position: string; phone: string }): Promise<Result<void>> { this.calls.push(`editMember:${userId}:${p.firstName}:${p.lastName}:${p.position}`); return ok(undefined); }
  async removeMember(_o: string, userId: string): Promise<Result<void>> { this.calls.push(`removeMember:${userId}`); return ok(undefined); }
  requests: MemberRequest[] = [];
  permission: MyPermission | null = null;
  async requestChange(_o: string, type: RequestType, reason: string): Promise<Result<void>> { this.calls.push(`requestChange:${type}:${reason}`); this.permission = { status: 'pendiente', expiresAt: null }; return ok(undefined); }
  async pendingRequests(): Promise<Result<MemberRequest[]>> { return ok([...this.requests]); }
  history: RequestRecord[] = [];
  async requestHistory(): Promise<Result<RequestRecord[]>> { return ok([...this.history]); }
  async respondRequest(id: string, approve: boolean): Promise<Result<void>> {
    this.calls.push(`respond:${id}:${approve}`);
    const r = this.requests.find((x) => x.id === id);
    if (r) this.history = [{ id: r.id, userId: r.userId, name: r.name, type: r.type, reason: r.reason, outcome: approve ? (r.type === 'datos' ? 'atendida' : 'aprobada') : 'rechazada', requestedAt: r.createdAt, answeredAt: new Date() }, ...this.history];
    this.requests = this.requests.filter((x) => x.id !== id); return ok(undefined);
  }
  async myPermission(): Promise<Result<MyPermission | null>> { return ok(this.permission); }
  async spendPasswordPermission(): Promise<Result<boolean>> { this.calls.push('spendPermission'); this.permission = { status: 'usada', expiresAt: null }; return ok(true); }
  async invitations() { return ok([...this.invitationsList]); }
  async queuePrefixes() { return ok({ ...this.prefixes }); }
  async setQueuePrefix(_o: string, q: string, p: string): Promise<Result<void>> { this.prefixes[q] = p.toUpperCase(); return ok(undefined); }
  async audit(_o: string, action: string): Promise<Result<void>> { this.audits.push(action); return ok(undefined); }
}

export class MemoryTokenStore implements TokenStore {
  data = new Map<string, AuthToken>();
  save(orgId: string, t: AuthToken) { this.data.set(orgId, t); }
  load(orgId: string) { return this.data.get(orgId) ?? null; }
  clear(orgId: string) { this.data.delete(orgId); }
}

export class FakeAuthRepository implements AuthRepository {
  loginFailure: Failure | null = null;
  logins: string[] = [];
  loginCount = 0;
  async login(identifier: string): Promise<Result<AuthToken>> {
    this.logins.push(identifier); this.loginCount++;
    if (this.loginFailure) return err(this.loginFailure);
    return ok({ accessToken: `tok${this.loginCount}`, expiresIn: 3600, issuedAt: new Date() });
  }
  registrations: RegisterInput[] = [];
  async register(i: RegisterInput): Promise<Result<Registration>> {
    this.registrations.push(i);
    return ok({ accountType: i.accountType, accountId: 'acc1', username: i.username, email: i.email, companyName: i.companyName ?? null, queueLimit: 6, createdAt: new Date() });
  }
}

export const makeQueue = (id: string, name: string, active = true): Queue => ({ id, ownerName: 'Notaría 12', name, description: null, active });
export const makeTicket = (id: string, n: number, status: TicketStatus, o: Partial<Ticket> = {}): Ticket => ({
  id, queueId: 'q1', ownerName: 'Notaría 12', userId: `cli-${n}`, slotStart: new Date('2026-10-20T14:00:00Z'), scheduled: false, number: n, status, position: 1,
  createdAt: new Date('2026-10-20T14:00:00Z'), calledAt: null, finishedAt: null, agentId: null, ...o,
});

export class FakeQueueRepository implements QueueRepository {
  queues: Queue[]; limitValue: QueueLimit | null = null; calls: string[] = []; lastSchedule: ScheduleInput | null = null; lastCreate: CreateQueueInput | null = null; createFailure: Failure | null = null;
  constructor(queues?: Queue[]) { this.queues = queues ?? [makeQueue('q1', 'Caja 1')]; }
  async list() { return ok([...this.queues]); }
  async get(id: string): Promise<Result<Queue>> { const q = this.queues.find((x) => x.id === id); return q ? ok(q) : err(notFoundFailure()); }
  async create(input: CreateQueueInput): Promise<Result<Queue>> {
    this.lastCreate = input;
    if (this.createFailure) return err(this.createFailure);
    const q = makeQueue(`q${this.queues.length + 1}`, input.name); this.queues.push(q); return ok(q);
  }
  async update(id: string, p: { name?: string; active?: boolean }): Promise<Result<Queue>> { this.calls.push(`update:${id}:${p.name}:${p.active}`); return this.get(id); }
  async delete(id: string): Promise<Result<void>> { this.calls.push(`delete:${id}`); return ok(undefined); }
  async limit() { const a = this.queues.filter((q) => q.active).length; return ok(this.limitValue ?? { accountType: 'empresa' as const, limit: 6, active: a, available: 6 - a }); }
  async schedule(id: string): Promise<Result<Schedule>> {
    return ok({ queueId: id, timeZone: 'America/Guayaquil', opens: '08:00:00', closes: '17:00:00', slotMinutes: 30, days: [1, 2, 3, 4, 5], turnMinutes: 10, stations: 2, dailyCapacity: 0, maxDaysAhead: 7, slotsPerDay: 18, capacityPerSlot: 6, turnsPerDay: 108 });
  }
  async replaceSchedule(id: string, input: ScheduleInput) { this.lastSchedule = input; return this.schedule(id); }
  async slots(): Promise<Result<Slot[]>> { return ok([]); }
  async state(id: string): Promise<Result<QueueState>> { return ok({ queueId: id, waiting: 3, serving: 1 }); }
}

export class FakeTicketRepository implements TicketRepository {
  tickets: Ticket[]; calls: string[] = []; actionFailure: Failure | null = null; filters: TicketFilter[] = [];
  constructor(t: Ticket[] = []) { this.tickets = t; }
  private act(name: string, id: string, status: TicketStatus): Result<Ticket> {
    this.calls.push(`${name}:${id}`);
    if (this.actionFailure) return err(this.actionFailure);
    const i = this.tickets.findIndex((t) => t.id === id);
    const next = { ...this.tickets[i]!, status, agentId: 'u1', calledAt: status === 'atendiendo' ? new Date() : this.tickets[i]!.calledAt, finishedAt: status === 'finalizado' ? new Date() : null };
    this.tickets = this.tickets.map((t, k) => (k === i ? next : t));
    return ok(next);
  }
  async create() { return ok(this.tickets[0]!); }
  async mine() { return ok(this.tickets); }
  async list(f: TicketFilter) { this.filters.push(f); const all = this.tickets.filter((t) => !f.queueId || t.queueId === f.queueId); return ok(all.slice(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 500))); }
  async get(id: string): Promise<Result<Ticket>> { const t = this.tickets.find((x) => x.id === id); return t ? ok(t) : err(notFoundFailure()); }
  async postpone(id: string) { return this.act('postpone', id, 'en_espera'); }
  async cancel(id: string) { return this.act('cancel', id, 'cancelado'); }
  async call(id: string) { return this.act('call', id, 'atendiendo'); }
  async finish(id: string) { return this.act('finish', id, 'finalizado'); }
  async noShow(id: string) { return this.act('noShow', id, 'no_show'); }
}

export class FakeRealtime implements RealtimeRepository {
  subs = new Set<QueueSubscription>();
  notificationSubs = new Set<(n: AppNotification) => void>();
  subscribeQueue(_q: string, sub: QueueSubscription) { this.subs.add(sub); sub.onStatus?.('connected'); return () => { this.subs.delete(sub); }; }
  subscribeNotifications(sub: { onNotification(n: AppNotification): void }): () => void { this.notificationSubs.add(sub.onNotification); return () => { this.notificationSubs.delete(sub.onNotification); }; }
  emit(e: QueueEvent) { this.subs.forEach((s) => s.onEvent(e)); }
  emitNotification(n: AppNotification) { this.notificationSubs.forEach((cb) => cb(n)); }
}

export class FakeHealth implements HealthRepository { async ready() { return ok({ supabase: 'ok', rabbitmq: 'ok' }); } }
export class FakeNotifications implements NotificationRepository {
  async list(): Promise<Result<AppNotification[]>> { return ok([]); }
  async markRead(): Promise<Result<AppNotification>> { return err(notFoundFailure()); }
  async delete(): Promise<Result<void>> { return ok(undefined); }
}

export { ApiContext, buildTestSession };


import type { NotificationsRealtime, NotificationsRepository, StaffNotice } from '@/features/notifications/notifications';
import type { BlockedInfo, Client, EditPermission, ClientsRepository, ClientTicket } from '@/features/clients/clients';
import type { AccessInfo, ActivityItem, AssuranceState, MfaEnrollment, MfaFactor, SecurityRepository } from '@/features/security/security';

export const makeNotice = (id: string, o: Partial<StaffNotice> = {}): StaffNotice => ({ id, kind: 'cliente', title: `Aviso ${id}`, message: 'Detalle del aviso.', route: null, read: false, createdAt: new Date(), ...o });

export class FakeNotices implements NotificationsRepository {
  calls: string[] = [];
  constructor(public items: StaffNotice[] = []) {}
  async list(_o: string, opts: { unreadOnly?: boolean } = {}): Promise<Result<StaffNotice[]>> { return ok(this.items.filter((n) => !opts.unreadOnly || !n.read)); }
  async unreadCount(): Promise<Result<number>> { return ok(this.items.filter((n) => !n.read).length); }
  async markRead(id: string): Promise<Result<void>> { this.calls.push(`read:${id}`); this.items = this.items.map((n) => (n.id === id ? { ...n, read: true } : n)); return ok(undefined); }
  async markAllRead(): Promise<Result<void>> { this.calls.push('readAll'); this.items = this.items.map((n) => ({ ...n, read: true })); return ok(undefined); }
  async remove(id: string): Promise<Result<void>> { this.calls.push(`remove:${id}`); this.items = this.items.filter((n) => n.id !== id); return ok(undefined); }
  async removeRead(): Promise<Result<void>> { this.calls.push('removeRead'); this.items = this.items.filter((n) => !n.read); return ok(undefined); }
}

/** Tiempo real de los avisos del equipo (doble de prueba): guarda los handlers y expone `emit()` para disparar un cambio. */
export class FakeNotificationsRealtime implements NotificationsRealtime {
  handlers = new Map<string, () => void>();
  subscribe(orgId: string, { onChange, onStatus }: { onChange: () => void; onStatus: (s: 'connected' | 'error' | 'closed') => void }): () => void {
    this.handlers.set(orgId, onChange);
    onStatus('connected');
    return () => { this.handlers.delete(orgId); };
  }
  emit(orgId: string) { this.handlers.get(orgId)?.(); }
}

export const makeClient = (id: string, o: Partial<Client> = {}): Client => ({
  userId: id, firstName: 'Carla', lastName: 'Mena', email: 'carla@x.co', phone: '+593 991111111', firstSeen: new Date(Date.now() - 2 * 864e5), lastTicket: new Date(Date.now() - 864e5),
  tickets: 5, served: 3, noShow: 1, cancelled: 1, follows: true, blocked: false, ...o,
});

export class FakeClients implements ClientsRepository {
  calls: string[] = [];
  constructor(public items: Client[] = [], public tickets: ClientTicket[] = []) {}
  async list(): Promise<Result<Client[]>> { return ok([...this.items]); }
  async history(): Promise<Result<ClientTicket[]>> { return ok([...this.tickets]); }
  async block(_o: string, userId: string, reason: string): Promise<Result<void>> { this.calls.push(`block:${userId}:${reason}`); this.items = this.items.map((c) => (c.userId === userId ? { ...c, blocked: true } : c)); return ok(undefined); }
  async unblock(_o: string, userId: string): Promise<Result<void>> { this.calls.push(`unblock:${userId}`); this.items = this.items.map((c) => (c.userId === userId ? { ...c, blocked: false } : c)); return ok(undefined); }
  permission: EditPermission | null = null;
  async remove(_o: string, userId: string): Promise<Result<void>> { this.calls.push(`remove:${userId}`); this.items = this.items.filter((c) => c.userId !== userId); return ok(undefined); }
  async requestEdit(_o: string, userId: string, reason: string): Promise<Result<void>> { this.calls.push(`requestEdit:${userId}:${reason}`); this.permission = { status: 'pendiente', requestedAt: new Date(), expiresAt: new Date(Date.now() + 48 * 36e5) }; return ok(undefined); }
  async editPermission(): Promise<Result<EditPermission | null>> { return ok(this.permission); }
  async edit(_o: string, userId: string, d: { firstName: string; lastName: string; phone: string }): Promise<Result<void>> {
    this.calls.push(`edit:${userId}:${d.firstName}:${d.lastName}:${d.phone}`);
    this.items = this.items.map((c) => (c.userId === userId ? { ...c, firstName: d.firstName, lastName: d.lastName, phone: d.phone || null } : c)); this.permission = { status: 'usada', requestedAt: new Date(), expiresAt: null }; return ok(undefined);
  }
  async blockInfo(_o: string, userId: string): Promise<Result<BlockedInfo | null>> { return ok(this.items.find((c) => c.userId === userId)?.blocked ? { reason: 'Abuso', createdAt: new Date() } : null); }
}

export class FakeSecurity implements SecurityRepository {
  calls: string[] = [];
  passwordFailure: Failure | null = null;
  async requestPasswordReset(email: string): Promise<Result<void>> { this.calls.push(`reset:${email}`); return ok(undefined); }
  async setPassword(): Promise<Result<void>> { this.calls.push('setPassword'); return ok(undefined); }
  async changePassword(_e: string, current: string): Promise<Result<void>> {
    this.calls.push(`changePassword:${current}`);
    return this.passwordFailure ? err(this.passwordFailure) : ok(undefined);
  }
  async signOutOthers(): Promise<Result<void>> { this.calls.push('signOutOthers'); return ok(undefined); }

  factors: MfaFactor[] = [];
  state: AssuranceState = { current: 'aal1', next: 'aal1' };
  verifyFailure: Failure | null = null;
  activityItems: ActivityItem[] = [];
  async mfaFactors(): Promise<Result<MfaFactor[]>> { return ok([...this.factors]); }
  async mfaEnroll(): Promise<Result<MfaEnrollment>> { this.calls.push('enroll'); return ok({ factorId: 'f-new', qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', secret: 'ABCD EFGH', uri: 'otpauth://totp/Qhub' }); }
  async mfaConfirm(factorId: string, code: string): Promise<Result<void>> {
    this.calls.push(`confirm:${factorId}:${code}`);
    if (this.verifyFailure) return err(this.verifyFailure);
    this.factors = [{ id: factorId, name: 'App', verified: true, createdAt: new Date() }]; this.state = { current: 'aal2', next: 'aal2' };
    return ok(undefined);
  }
  async mfaRemove(id: string): Promise<Result<void>> { this.calls.push(`remove:${id}`); this.factors = this.factors.filter((f) => f.id !== id); this.state = { current: 'aal1', next: 'aal1' }; return ok(undefined); }
  async mfaVerify(factorId: string, code: string): Promise<Result<void>> {
    this.calls.push(`verify:${factorId}:${code}`);
    if (this.verifyFailure) return err(this.verifyFailure);
    this.state = { current: 'aal2', next: 'aal2' };
    return ok(undefined);
  }
  async assurance(): Promise<Result<AssuranceState>> { return ok({ ...this.state }); }
  async changeEmail(email: string): Promise<Result<void>> { this.calls.push(`email:${email}`); return ok(undefined); }
  async signOutEverywhere(): Promise<Result<void>> { this.calls.push('signOutEverywhere'); return ok(undefined); }
  async access(): Promise<Result<AccessInfo>> { return ok({ lastSignInAt: new Date(Date.now() - 36e5), createdAt: new Date('2026-01-10T10:00:00Z'), provider: 'email', emailConfirmed: true, pendingEmail: null }); }
  async activity(): Promise<Result<ActivityItem[]>> { return ok([...this.activityItems]); }
}


import type { QhubLinkRepository } from '@/features/qhub/link';

/** Conexión con Qhub guardada en el servidor (doble de prueba). */
export class FakeQhubLink implements QhubLinkRepository {
  calls: string[] = [];
  issueFailure: Failure | null = null;
  connectFailure: Failure | null = null;
  publishFailure: Failure | null = null;
  issued = 0;
  async issueToken(orgId: string): Promise<Result<AuthToken>> {
    this.calls.push(`issue:${orgId}`); this.issued++;
    return this.issueFailure ? err(this.issueFailure) : ok({ accessToken: `servidor-${this.issued}`, expiresIn: 3600, issuedAt: new Date() });
  }
  async connect(orgId: string, identifier: string): Promise<Result<void>> { this.calls.push(`connect:${orgId}:${identifier}`); return this.connectFailure ? err(this.connectFailure) : ok(undefined); }
  async publish(orgId: string): Promise<Result<void>> { this.calls.push(`publish:${orgId}`); return this.publishFailure ? err(this.publishFailure) : ok(undefined); }
  async unpublish(orgId: string): Promise<Result<void>> { this.calls.push(`unpublish:${orgId}`); return ok(undefined); }
  async disconnect(orgId: string): Promise<Result<void>> { this.calls.push(`disconnect:${orgId}`); return ok(undefined); }
}


import type { CredentialVault, SavedCredential } from '@/features/qhub/vault';

/** Guardado en el dispositivo (en memoria). */
export class FakeVault implements CredentialVault {
  data = new Map<string, SavedCredential>();
  supported = true;
  isSupported() { return this.supported; }
  async save(orgId: string, c: SavedCredential) { if (!this.supported) return false; this.data.set(orgId, c); return true; }
  async load(orgId: string) { return this.data.get(orgId) ?? null; }
  async has(orgId: string) { return this.data.has(orgId); }
  async clear(orgId: string) { this.data.delete(orgId); }
}
