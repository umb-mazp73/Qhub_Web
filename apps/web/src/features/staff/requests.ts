/** Lo que una persona del equipo le pide a su administrador. */
export type RequestType = 'contrasena' | 'correo' | 'datos';
export const REQUEST_LABEL: Record<RequestType, string> = { contrasena: 'Cambiar su contraseña', correo: 'Cambiar su correo', datos: 'Cambiar sus datos' };
export interface MemberRequest { id: string; userId: string; name: string; type: RequestType; reason: string | null; createdAt: Date }
/** Estado del permiso propio. `vencida`: pasaron 24 h desde que se aprobó. */
export type PermissionStatus = 'pendiente' | 'aprobada' | 'rechazada' | 'usada' | 'vencida';
export interface MyPermission { status: PermissionStatus; expiresAt: Date | null }
export const canAskAgain = (p: MyPermission | null) => !p || p.status === 'rechazada' || p.status === 'usada' || p.status === 'vencida';

/** Registro de una solicitud ya resuelta (historial del administrador). `atendida`: solicitud de datos que el administrador resolvió editando el perfil. */
export type RequestOutcome = 'aprobada' | 'usada' | 'rechazada' | 'vencida' | 'atendida';
export const OUTCOME_LABEL: Record<RequestOutcome, string> = { aprobada: 'Aprobada', usada: 'Aprobada · ya usada', rechazada: 'Rechazada', vencida: 'Vencida', atendida: 'Atendida' };
export interface RequestRecord { id: string; userId: string; name: string; type: RequestType; reason: string | null; outcome: RequestOutcome; requestedAt: Date; answeredAt: Date | null }
