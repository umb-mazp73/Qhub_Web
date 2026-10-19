import { describe, expect, it } from 'vitest';
import { passwordStrength, slugify, validateEmail, validatePassword, initialsOf } from '../src';

describe('validaciones', () => {
  it('validaciones', () => {
    expect(validateEmail('a@b.co')).toBeNull(); expect(validateEmail('a@')).not.toBeNull();
    expect(validatePassword('Taza-azul-77')).toBeNull(); expect(validatePassword('abc1234')).not.toBeNull();
  });
  it('slugify e iniciales', () => {
    expect(slugify('Notaría 12 · Sede Norte')).toBe('notaria-12-sede-norte');
    expect(slugify('  ¡¡¡  ')).toBe('organizacion');
    expect(slugify('Ñandú')).toBe('nandu');
    expect(initialsOf('Ana Gómez', 'a@b.c')).toBe('AG');
    expect(initialsOf(undefined, 'luis@b.c')).toBe('LB');
  });
  it('contraseña: letras y números; medidor 0–4', () => {
    expect(validatePassword('abcdefgh')).not.toBeNull(); expect(validatePassword('Taza-azul-77')).toBeNull();
    expect(passwordStrength('abc')).toBe(0); expect(passwordStrength('Abcdefg1!xyz')).toBe(4);
  });
});
