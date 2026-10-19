import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, isProfileComplete, validateProfile } from './profile';

describe('perfil', () => {
  const ok = { ...EMPTY_PROFILE, firstName: 'Ana', lastName: 'Gómez' };
  it('exige nombre y apellido', () => {
    expect(validateProfile(ok)).toEqual({});
    expect(Object.keys(validateProfile(EMPTY_PROFILE))).toEqual(['firstName', 'lastName']);
  });
  it('valida teléfono, cargo y ciudad sin país', () => {
    expect(validateProfile({ ...ok, phone: '+593 991234567' })).toEqual({});
    expect(validateProfile({ ...ok, phone: 'abc' }).phone).toBeDefined();
    expect(validateProfile({ ...ok, city: 'Quito' }).country).toBeDefined();
    expect(validateProfile({ ...ok, jobTitle: 'x' }).jobTitle).toBeDefined();
  });
  it('perfil completo', () => {
    expect(isProfileComplete({ ...EMPTY_PROFILE, firstName: 'A', lastName: 'B', phone: '+593 99', country: 'EC', city: 'Quito' })).toBe(true);
    expect(isProfileComplete({ ...EMPTY_PROFILE, firstName: 'A', lastName: 'B' })).toBe(false);
  });
});
