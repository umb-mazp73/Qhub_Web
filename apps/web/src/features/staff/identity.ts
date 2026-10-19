/** Persona que inició sesión en el panel. `passwordAssigned`: su administrador le asignó la contraseña; cambiarla exige su permiso. */
export interface StaffUser { id: string; email: string; displayName?: string; passwordAssigned?: boolean }
