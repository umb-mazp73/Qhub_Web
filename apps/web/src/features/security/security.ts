import type { Result } from '@qhub/core';

export interface MfaFactor { id: string; name: string; verified: boolean; createdAt: Date }
/** Datos para enrolar la app autenticadora: se muestra el QR (SVG) y la clave por si no se puede escanear. */
export interface MfaEnrollment { factorId: string; qrSvg: string; secret: string; uri: string }
export type AssuranceLevel = 'aal1' | 'aal2';
export interface AssuranceState { current: AssuranceLevel; next: AssuranceLevel }

export interface AccessInfo { lastSignInAt: Date | null; createdAt: Date | null; provider: string; emailConfirmed: boolean; pendingEmail: string | null }
export interface ActivityItem { id: number; action: string; entity: string | null; createdAt: Date }

export interface SecurityRepository {
  /** Envía el correo para elegir una contraseña nueva. Responde igual exista o no la cuenta. */
  requestPasswordReset(email: string): Promise<Result<void>>;
  /** Fija la contraseña nueva (sesión de recuperación o sesión normal tras verificar la actual). */
  setPassword(password: string): Promise<Result<void>>;
  /** Verifica la contraseña actual y la cambia. */
  changePassword(email: string, current: string, next: string): Promise<Result<void>>;
  /** Cierra la sesión en todos los demás dispositivos. */
  signOutOthers(): Promise<Result<void>>;
  mfaFactors(): Promise<Result<MfaFactor[]>>;
  mfaEnroll(name: string): Promise<Result<MfaEnrollment>>;
  /** Confirma el enrolamiento con el primer código de la app. */
  mfaConfirm(factorId: string, code: string): Promise<Result<void>>;
  mfaRemove(factorId: string): Promise<Result<void>>;
  /** Paso 2 del inicio de sesión: eleva la sesión a `aal2`. */
  mfaVerify(factorId: string, code: string): Promise<Result<void>>;
  assurance(): Promise<Result<AssuranceState>>;
  changeEmail(email: string): Promise<Result<void>>;
  signOutEverywhere(): Promise<Result<void>>;
  access(): Promise<Result<AccessInfo>>;
  activity(orgId: string, limit?: number): Promise<Result<ActivityItem[]>>;
}

export const mfaRequired = (a: AssuranceState): boolean => a.next === 'aal2' && a.current !== 'aal2';

/** Un código TOTP son 6 dígitos. */
export const validateTotp = (v: string): string | null => (/^\d{6}$/.test(v.replace(/\s/g, '')) ? null : 'Escribe los 6 dígitos de tu app.');

const ACTION_LABEL: Record<string, string> = {
  'cola.crear': 'Creaste una cola', 'cola.editar': 'Editaste una cola', 'cola.archivar': 'Archivaste una cola',
};
export const activityLabel = (a: string): string => ACTION_LABEL[a] ?? a.replaceAll('.', ' ').replaceAll('_', ' ');

/** "Chrome en Windows": descripción corta del navegador, sin guardar nada. */
export function describeBrowser(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'un dispositivo';
  return `${browser} en ${os}`;
}

/** El QR llega como data URI o como SVG en texto: siempre se muestra en un <img> (nunca se inyecta HTML). */
export const qrSrc = (qr: string): string => (qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`);

export interface SecurityCheck { id: string; label: string; ok: boolean }
/** Nivel de seguridad de la cuenta: lo que ya está cuidado y lo que falta. */
export function securityChecks(o: { emailConfirmed: boolean; mfa: boolean; phone: boolean }): { checks: SecurityCheck[]; score: number } {
  const checks: SecurityCheck[] = [
    { id: 'email', label: 'Correo confirmado', ok: o.emailConfirmed },
    { id: 'mfa', label: 'Verificación en dos pasos activa', ok: o.mfa },
    { id: 'phone', label: 'Teléfono de contacto registrado', ok: o.phone },
  ];
  return { checks, score: checks.filter((c) => c.ok).length };
}
