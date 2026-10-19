import { describe, expect, it } from 'vitest';
import { citiesOf, COUNTRIES, countryByAny, timeZonesOf } from '../src';

describe('geografía', () => {
  it('país por código o nombre, ciudades y zonas', () => {
    expect(countryByAny('EC')?.name).toBe('Ecuador'); expect(countryByAny('ecuador')?.code).toBe('EC'); expect(countryByAny('Narnia')).toBeUndefined();
    expect(citiesOf('CO')).toContain('Medellín'); expect(citiesOf('xx')).toEqual([]);
    expect(timeZonesOf('MX').length).toBeGreaterThan(1);
  });
  it('datos consistentes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) { expect(c.dial).toMatch(/^\+\d{1,3}$/); expect(c.cities.length).toBeGreaterThan(3); expect(c.timeZones.length).toBeGreaterThan(0); }
  });
});
