/**
 * El código de la invitación que llegó por el botón del correo. Se recuerda mientras dura la pestaña para que sobreviva
 * al inicio de sesión (si la persona aún no había entrado, primero pasa por el login y luego vuelve a aceptar).
 */
const KEY = 'qhub.invitacion';
const valid = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(t);

export function rememberInvitation(token: string | null | undefined): void {
  if (!valid(token)) return;
  try { sessionStorage.setItem(KEY, token); } catch { /* sin storage */ }
}
export function pendingInvitation(): string | null {
  try { const t = sessionStorage.getItem(KEY); return valid(t) ? t : null; } catch { return null; }
}
export function clearInvitation(): void { try { sessionStorage.removeItem(KEY); } catch { /* sin storage */ } }
