import type { RegisterInput } from '@qhub/api-client';
import type { AccountKind } from '@/features/staff';

/** Usuario de Qhub sacado del correo (3 a 30, minúsculas, números, punto, guion). Del segundo intento en adelante lleva números al final. */
export function qhubUsername(email: string, attempt = 0): string {
  const base = (email.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 22).padEnd(3, 'x');
  return attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Datos para crear la cuenta Qhub con el mismo correo y contraseña de la web. */
export function qhubRegistration(o: { kind: AccountKind; orgName: string; fullName?: string; email: string; password: string; country: string; city: string; attempt?: number }): RegisterInput {
  const [first, ...rest] = (o.fullName?.trim() || '').split(/\s+/).filter(Boolean);
  const personal = o.kind === 'persona';
  return {
    accountType: personal ? 'usuario' : 'empresa', ...(personal ? {} : { companyName: o.orgName }),
    firstName: first ?? 'Usuario', lastName: rest.join(' ') || first || 'Qhub', username: qhubUsername(o.email, o.attempt ?? 0),
    email: o.email, password: o.password, country: o.country, city: o.city, acceptedTerms: true,
  };
}
