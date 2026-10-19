/** Validaciones y utilidades de texto compartidas por web y móvil (mensajes en español, tuteando). */

/**
 * Correo: sin espacios, una sola @, parte local de hasta 64 caracteres sin puntos al borde ni dobles, dominio con puntos
 * válidos y terminación de 2 o más letras, y 254 en total.
 */
export function validateEmail(v: string): string | null {
  const msg = 'Escribe un correo válido.';
  const e = v.trim();
  if (e.length < 6 || e.length > 254 || /\s/.test(e) || (e.match(/@/g) ?? []).length !== 1) return msg;
  const [local, domain] = e.split('@') as [string, string];
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return msg;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((l) => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return msg;
  if (!/^[A-Za-z]{2,}$/.test(labels[labels.length - 1]!)) return msg;
  return null;
}

/** Distancia de edición con transposiciones (gamil → gmail = 1). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
  }
  return d[a.length]![b.length]!;
}
const COMMON_DOMAINS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'msn.com', 'protonmail.com', 'yahoo.es', 'hotmail.es', 'outlook.es', 'gmail.es'];

/** Si el dominio parece un error de tipeo de uno muy común (gamil.com, hotmial.com, gmail.con), devuelve el correo corregido; si no, `null`. */
export function suggestEmailFix(email: string): string | null {
  const e = email.trim().toLowerCase();
  if (validateEmail(e) !== null) return null;
  const [local, domain] = e.split('@') as [string, string];
  if (COMMON_DOMAINS.includes(domain)) return null;
  const best = COMMON_DOMAINS.map((d) => ({ d, n: distance(domain, d) })).sort((x, y) => x.n - y.n)[0]!;
  return best.n <= 2 && domain.length >= 7 ? `${local}@${best.d}` : null;
}

const NAME = /^[\p{L}][\p{L}\p{M}\s'’.-]*$/u;
/** Nombre o apellido de persona: solo letras (con tildes), espacios, apóstrofos, puntos y guiones; 2 a 60. */
export function validatePersonName(v: string, what = 'tu nombre'): string | null {
  const t = v.trim();
  if (t.length < 2) return `Escribe ${what} (mínimo 2 letras).`;
  if (t.length > 60) return 'Usa 60 caracteres como máximo.';
  if (!NAME.test(t) || /(.)\1{3,}/u.test(t)) return 'Usa solo letras, sin números ni símbolos.';
  return null;
}

/** Nombre de una organización o de un espacio personal: 2 a 80, con al menos una letra y sin caracteres de control. */
export function validateOrgName(v: string, what = 'la organización'): string | null {
  const t = v.trim();
  if (t.length < 2) return `Escribe el nombre de ${what}.`;
  if (t.length > 80) return 'Usa 80 caracteres como máximo.';
  if (!/\p{L}/u.test(t) || /[\u0000-\u001f<>]/.test(t)) return 'El nombre debe tener letras y no puede llevar símbolos como < o >.';
  return null;
}

/** Nombre de usuario de Qhub: 3 a 30, letras minúsculas, números, punto, guion y guion bajo. */
export function validateUsername(v: string): string | null {
  const t = v.trim();
  if (t.length < 3 || t.length > 30) return 'Usa entre 3 y 30 caracteres.';
  return /^[a-z0-9][a-z0-9._-]*$/.test(t) ? null : 'Usa minúsculas, números, punto, guion o guion bajo, sin espacios.';
}

const COMMON_PASSWORDS = ['12345678', '123456789', '1234567890', 'password', 'password1', 'contraseña', 'contrasena', 'qwerty123', 'qwertyuiop', 'abc12345', 'abcd1234', 'iloveyou', 'admin123', 'letmein1', 'bienvenido', 'bienvenido1', 'qhub1234', 'colombia1', 'ecuador123', 'mexico123'];

/** Mínimo 8 caracteres (máximo 72). Con `mixed` (por defecto) exige letras y números; y no admite claves muy comunes ni el propio correo. */
export function validatePassword(v: string, o: { mixed?: boolean; email?: string } = {}): string | null {
  if (v.length < 8) return 'Usa al menos 8 caracteres.';
  if (v.length > 72) return 'Usa 72 caracteres como máximo.';
  if ((o.mixed ?? true) && (!/[a-z]/i.test(v) || !/[0-9]/.test(v))) return 'Combina letras y números.';
  if (o.mixed !== false) {
    const low = v.toLowerCase();
    if (COMMON_PASSWORDS.includes(low) || /^(.)\1+$/.test(low)) return 'Esa contraseña es muy común. Elige otra.';
    const local = (o.email ?? '').split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 4 && low.includes(local)) return 'No uses tu correo dentro de la contraseña.';
  }
  return null;
}

/** 0–4 para el medidor de fortaleza de contraseña. */
export function passwordStrength(v: string): number {
  let n = 0;
  if (v.length >= 8) n++;
  if (v.length >= 12) n++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) n++;
  if (/[0-9]/.test(v) && /[^a-zA-Z0-9]/.test(v)) n++;
  return n;
}

const PHONE = /^\+?[0-9 ()-]{7,20}$/;
export const isValidPhone = (v: string): boolean => PHONE.test(v.trim());

/** Genera un slug `[a-z0-9-]+` a partir de un nombre. */
export function slugify(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'organizacion';
}

/** Iniciales (`AG`) de un nombre; si no hay, del correo (`LB` para `luis@b.c`). */
export function initialsOf(displayName: string | undefined, email: string): string {
  const base = displayName?.trim() ? displayName.trim() : email;
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Primer nombre para saludar; si no hay nombre usa lo anterior a la @ del correo. */
export function firstNameOf(displayName: string | undefined, email = ''): string {
  const base = displayName?.trim() || email.split('@')[0] || '';
  return base.split(/\s+/)[0] ?? '';
}

/** Entero aleatorio criptográfico en [0, n). `crypto` existe en navegadores y Node; el paquete no depende de sus tipos. */
function secureRandom(n: number): number {
  const c = (globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto;
  const max = Math.floor(0x100000000 / n) * n;                  // sin sesgo de módulo
  const b = new Uint32Array(1);
  do { c.getRandomValues(b); } while (b[0]! >= max);
  return b[0]! % n;
}

/** Contraseña aleatoria legible (sin caracteres que se confunden: 0/O, 1/l/I). Siempre cumple `validatePassword`. */
export function generatePassword(length = 14, random: (n: number) => number = secureRandom): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '-_.!#'];
  const all = sets.join('');
  const out = sets.map((s) => s[random(s.length)]!);                      // al menos uno de cada tipo
  while (out.length < length) out.push(all[random(all.length)]!);
  for (let i = out.length - 1; i > 0; i--) { const j = random(i + 1); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out.join('');
}
