import { describe, expect, it } from 'vitest';
import { optionalEnv, requireEnv } from '../src';

describe('env', () => {
  it('exige las obligatorias con un mensaje claro y recorta espacios', () => {
    expect(requireEnv({ A: ' x ' }, 'A')).toBe('x');
    expect(() => requireEnv({}, 'VITE_X')).toThrow('Falta VITE_X en el archivo .env');
    expect(() => requireEnv({ A: '   ' }, 'A')).toThrow(/Falta A/);
  });
  it('las opcionales usan su valor por defecto', () => { expect(optionalEnv({}, 'B', 'production')).toBe('production'); expect(optionalEnv({ B: 'dev' }, 'B', 'production')).toBe('dev'); });
});
