import type { OrgRole } from './roles';

/** Persona natural (espacio personal, sin equipo) u organización (empresa, con equipo y roles). */
export type AccountKind = 'persona' | 'empresa';
export const ACCOUNT_KINDS: ReadonlyArray<{ value: AccountKind; label: string; hint: string }> = [
  { value: 'persona', label: 'Soy una persona', hint: 'Cuenta personal para ti: hasta 3 colas y sin equipo. Ideal para profesionales independientes.' },
  { value: 'empresa', label: 'Soy una organización', hint: 'Para una empresa o institución: hasta 6 colas, equipo con roles, invitaciones y clientes.' },
];
export const spaceName = (k: AccountKind) => (k === 'persona' ? 'cuenta personal' : 'organización');

/** `qhubConnected`: la conexión con Qhub ya se confirmó una vez (lo registra la base de datos); con eso no se vuelve a mostrar la pantalla de conectar. */
export interface Organization { id: string; /** ID público corto (QH-XXXXXX) para que los clientes la encuentren en la app móvil */ code: string; kind: AccountKind; qhubConnected: boolean; name: string; slug: string; timeZone: string; city?: string | null; country?: string | null; published: boolean; linked: boolean }
export interface Membership { organization: Organization; role: OrgRole }
export const isAdmin = (m: Membership | null | undefined) => m?.role === 'admin' || m?.role === 'propietario';
/** Perfil básico de alguien del equipo, tal como lo ve y edita un administrador. */
export interface MemberProfile { firstName: string; lastName: string; position: string; phone: string; email: string }
export interface Member { userId: string; name: string; role: OrgRole; active: boolean }
/** Lo que el administrador deja configurado para la persona invitada (todo opcional). */
export interface InviteProfile { firstName?: string; lastName?: string; position?: string }
export interface Invitation extends InviteProfile { id: string; email: string; role: OrgRole; token: string; expiresAt: Date; acceptedAt: Date | null; sentAt?: Date | null }
/** Resultado de invitar: `sent=false` si el correo no salió (límite de envíos, etc.); la invitación queda creada y se comparte con el código. */
export interface InviteResult { invitation: Invitation; sent: boolean; reason?: 'limite' | 'envio'; /** La contraseña inicial quedó asignada a la cuenta nueva. */ passwordSet?: boolean }
/** Lo que ve la persona invitada antes de aceptar. */
export interface InvitationPreview extends InviteProfile { organization: string; kind: AccountKind; role: OrgRole; email: string; expiresAt: Date }
export const invitationLabel = (i: Pick<Invitation, 'firstName' | 'lastName' | 'email'>) => [i.firstName, i.lastName].filter(Boolean).join(' ') || i.email;
/** El código se muestra censurado: solo las últimas 4 cifras. */
export const maskToken = (t: string) => (t.length <= 4 ? '••••' : `${'•'.repeat(12)}${t.slice(-4)}`);
export const invitationPending = (i: Invitation, now = new Date()) => i.acceptedAt === null && i.expiresAt.getTime() > now.getTime();
