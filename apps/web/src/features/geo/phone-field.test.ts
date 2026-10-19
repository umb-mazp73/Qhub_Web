import { describe, expect, it } from 'vitest';
import { splitPhone } from '@/features/geo/PhoneField';

describe('teléfono', () => {
  it('separa prefijo y número', () => {
    expect(splitPhone('+593 991234567', '+57')).toEqual({ dial: '+593', number: '991234567' });
    expect(splitPhone('991234567', '+57')).toEqual({ dial: '+57', number: '991234567' });
  });
});
