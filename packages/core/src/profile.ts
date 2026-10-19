import { isValidPhone } from './validation';
import { validatePersonName } from './validation';

/** Datos editables de la persona (tabla `perfiles`). Compartido por web y móvil. */
export interface Profile {
  firstName: string; lastName: string; phone: string; jobTitle: string;
  country: string; city: string; timeZone: string;
}
export const EMPTY_PROFILE: Profile = { firstName: '', lastName: '', phone: '', jobTitle: '', country: '', city: '', timeZone: '' };

/** Perfil "completo" para la lista de arranque: identidad, contacto y ubicación. */
export const isProfileComplete = (p: Profile): boolean => !!(p.firstName.trim() && p.lastName.trim() && p.phone.trim() && p.country && p.city);

/** Validaciones del perfil; devuelve un mensaje por campo con problema. */
export function validateProfile(p: Profile): Partial<Record<keyof Profile, string>> {
  const e: Partial<Record<keyof Profile, string>> = {};
  const fn = validatePersonName(p.firstName, 'tu nombre'); if (fn) e.firstName = fn;
  const ln = validatePersonName(p.lastName, 'tu apellido'); if (ln) e.lastName = ln;
  if (p.phone.trim() && !isValidPhone(p.phone)) e.phone = 'Usa entre 7 y 20 dígitos; puede llevar + y espacios.';
  if (p.jobTitle.trim() && (p.jobTitle.trim().length < 2 || p.jobTitle.trim().length > 80)) e.jobTitle = 'El cargo debe tener entre 2 y 80 caracteres.';
  if (p.city && !p.country) e.country = 'Elige primero el país.';
  return e;
}
