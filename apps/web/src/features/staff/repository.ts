import type { Result } from '@qhub/core';
import type { StaffUser } from './identity';
import type { MemberRequest, MyPermission, RequestRecord, RequestType } from './requests';
import type { AccountKind, MemberProfile, Invitation, InvitationPreview, InviteProfile, InviteResult, Member, Membership, Organization } from './organization';
import type { Profile } from './profile';
import type { OrgRole } from './roles';

/** Identidad y datos propios del panel (Supabase). Nunca habla con la API Qhub. Cada puerto es una responsabilidad. */
export interface AuthPort {
  currentUser(): Promise<StaffUser | null>;
  /** Emite el usuario actual al suscribirse y cada vez que cambia la sesión. Devuelve la función que cancela. */
  onAuthChange(cb: (u: StaffUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<Result<StaffUser>>;
  /** `null` = el proyecto exige confirmar el correo antes de entrar. */
  signUp(input: { email: string; password: string; firstName: string; lastName: string }): Promise<Result<StaffUser | null>>;
  signOut(): Promise<Result<void>>;
}

export interface ProfilePort {
  profile(): Promise<Result<Profile>>;
  updateProfile(p: Profile): Promise<Result<Profile>>;
  /** Elimina la cuenta de forma definitiva (falla si es el único administrador de una organización con más gente). */
  deleteAccount(): Promise<Result<void>>;
}

export interface OrganizationPort {
  memberships(): Promise<Result<Membership[]>>;
  createOrganization(input: { name: string; slug: string; kind?: AccountKind; city?: string; country?: string; timeZone?: string }): Promise<Result<string>>;
  acceptInvitation(token: string): Promise<Result<string>>;
  /** Lo que ve la persona invitada antes de aceptar (solo si la invitación es para su correo). */
  previewInvitation(token: string): Promise<Result<InvitationPreview>>;
  /** La contraseña que le asignó el administrador (si la hay): la ve para copiarla; se borra al aceptar. */
  initialPassword(token: string): Promise<Result<string | null>>;
  updateOrganization(id: string, patch: { name?: string; city?: string; country?: string }): Promise<Result<Organization>>;
  /** Registra en la base de datos que la conexión con Qhub ya se hizo (solo administradores). */
  confirmQhubConnection(orgId: string): Promise<Result<void>>;
  audit(orgId: string, action: string, extra?: { entity?: string; entityId?: string; detail?: Record<string, unknown> }): Promise<Result<void>>;
}

export interface TeamPort {
  members(orgId: string): Promise<Result<Member[]>>;
  updateMember(orgId: string, userId: string, patch: { role?: OrgRole; active?: boolean }): Promise<Result<void>>;
  /** Crea (o actualiza) la invitación con el perfil configurado y envía el correo con el botón para aceptar. */
  invite(orgId: string, input: { email: string; role: OrgRole; password?: string } & InviteProfile): Promise<Result<InviteResult>>;
  resendInvitation(orgId: string, invitationId: string): Promise<Result<InviteResult>>;
  cancelInvitation(invitationId: string): Promise<Result<void>>;
  invitations(orgId: string): Promise<Result<Invitation[]>>;
  /** Solo administradores y solo gente de su equipo (nunca clientes). */
  memberProfile(orgId: string, userId: string): Promise<Result<MemberProfile>>;
  editMember(orgId: string, userId: string, p: { firstName: string; lastName: string; position: string; phone: string }): Promise<Result<void>>;
  /** Solicitudes de la gente del equipo al administrador (contraseña, datos). */
  requestChange(orgId: string, type: RequestType, reason: string): Promise<Result<void>>;
  pendingRequests(orgId: string): Promise<Result<MemberRequest[]>>;
  respondRequest(id: string, approve: boolean): Promise<Result<void>>;
  /** Solicitudes ya resueltas (solo administradores). */
  requestHistory(orgId: string): Promise<Result<RequestRecord[]>>;
  myPermission(orgId: string, type: RequestType): Promise<Result<MyPermission | null>>;
  /** Gasta el permiso de contraseña (un cambio). `false` si no había uno vigente. */
  spendPasswordPermission(orgId: string): Promise<Result<boolean>>;
  /** Termina su pertenencia al equipo; no borra la cuenta de la persona. */
  removeMember(orgId: string, userId: string): Promise<Result<void>>;
}

export interface QueueLabelPort {
  queuePrefixes(orgId: string): Promise<Result<Record<string, string>>>;
  setQueuePrefix(orgId: string, queueId: string, prefix: string): Promise<Result<void>>;
}

export interface StaffRepository extends AuthPort, ProfilePort, OrganizationPort, TeamPort, QueueLabelPort {}
