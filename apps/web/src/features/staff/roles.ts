import type { ActorRole } from '@qhub/api-client';

/** `propietario` no existe en la base: es el `admin` de una cuenta personal (sin equipo), con la misma autoridad menos la gestión de equipo. */
export type OrgRole = 'admin' | 'supervisor' | 'agente' | 'recepcion' | 'propietario';
/** Roles que se pueden asignar a un integrante del equipo. */
export const ORG_ROLES: readonly OrgRole[] = ['admin', 'supervisor', 'agente', 'recepcion'];
export const ORG_ROLE_LABEL: Record<OrgRole, string> = { admin: 'Administrador', supervisor: 'Supervisor', agente: 'Agente', recepcion: 'Recepción', propietario: 'Titular' };
export const ORG_ROLE_HINT: Record<OrgRole, string> = {
  admin: 'Todo: colas, equipo, clientes (con su contacto y bloqueo), ajustes y atención.',
  supervisor: 'Ve la operación, el historial, el equipo y los clientes. No atiende ni edita.',
  agente: 'Atiende la fila y consulta el historial.',
  recepcion: 'Atiende la fila. Sin historial, equipo ni ajustes.',
  propietario: 'Tu cuenta personal: colas, fila, historial, clientes y ajustes. No tiene equipo.',
};
/** La API Qhub solo conoce `admin` y `agente`: el resto de roles opera como agente y la web limita lo que ve. */
export const toActorRole = (r: OrgRole): ActorRole => (r === 'admin' || r === 'propietario' ? 'admin' : 'agente');
export const parseOrgRole = (v: unknown): OrgRole => (ORG_ROLES as readonly unknown[]).includes(v) ? (v as OrgRole) : 'agente';

/** Rol en la interfaz: el administrador de una cuenta personal es el titular. */
export const effectiveRole = (dbRole: OrgRole, kind: 'persona' | 'empresa'): OrgRole => (kind === 'persona' && dbRole === 'admin' ? 'propietario' : dbRole);
