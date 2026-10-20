/** Persona que inició sesión en el panel. `passwordAssigned`: su administrador le asignó la contraseña; cambiarla exige su permiso. */
export interface StaffUser {
  id: string; email: string; displayName?: string; passwordAssigned?: boolean;
  /** Lo que eligió al crear la cuenta (tipo, nombre y lugar): con eso se crea la organización al entrar, sin volver a preguntarlo. */
  pendingOrg?: { kind: 'persona' | 'empresa'; name: string; country: string; city: string; timeZone: string };
}
