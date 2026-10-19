import { describe, expect, it } from 'vitest';
import { generatePassword, suggestEmailFix, validateEmail, validateOrgName, validatePassword, validatePersonName, validateUsername } from '../src';

describe('correo', () => {
  it('acepta correos reales', () => { for (const e of ['ana@x.co', 'ana.gomez+turnos@empresa.com.ec', ' a_b-c@sub.dominio.org ', 'ñ@x.es'.replace('ñ', 'n')]) expect(validateEmail(e), e).toBeNull(); });
  it('rechaza lo que no es un correo', () => {
    for (const e of ['', 'a@', '@x.co', 'ana@x', 'ana@x.c', 'ana@@x.co', 'ana @x.co', 'ana@x .co', '.ana@x.co', 'ana.@x.co', 'a..b@x.co', 'ana@-x.co', 'ana@x..co', 'ana@x.123', 'ana@x.c0m', `${'a'.repeat(65)}@x.co`, `a@${'b'.repeat(250)}.co`, 'ana@gmail,com', 'ana<script>@x.co'])
      expect(validateEmail(e), e).not.toBeNull();
  });
});

describe('sugerencia de correo', () => {
  it('corrige errores típicos de tipeo en dominios comunes', () => {
    expect(suggestEmailFix('pena@gamil.com')).toBe('pena@gmail.com'); expect(suggestEmailFix('a@hotmial.com')).toBe('a@hotmail.com'); expect(suggestEmailFix('a@gmail.con')).toBe('a@gmail.com');
    expect(suggestEmailFix('a@outlok.com')).toBe('a@outlook.com'); expect(suggestEmailFix('a@yaho.com')).toBe('a@yahoo.com');
  });
  it('no molesta cuando está bien o es otro dominio', () => {
    for (const e of ['a@gmail.com', 'a@empresa.com', 'a@notaria12.ec', 'a@x.co', 'no-es-correo', '']) expect(suggestEmailFix(e), e).toBeNull();
  });
});

describe('nombres', () => {
  it('personas: letras con tildes, apóstrofos y guiones', () => { for (const n of ['Ana', 'María José', "O'Brien", 'Ñandú', 'Jean-Luc', 'Dr. Pérez']) expect(validatePersonName(n), n).toBeNull(); });
  it('rechaza números, símbolos, muy corto, muy largo y repeticiones', () => {
    for (const n of ['', 'A', 'Ana2', '123', 'Ana <b>', 'Ana@', 'x'.repeat(61), 'aaaaa']) expect(validatePersonName(n), n).not.toBeNull();
    expect(validatePersonName('', 'tu apellido')).toContain('tu apellido');
  });
  it('organización: con letras, 2 a 80 y sin < >', () => {
    for (const n of ['Notaría 12', 'Dra. Ana Gómez', 'Banco del Sur S.A.']) expect(validateOrgName(n), n).toBeNull();
    for (const n of ['', 'A', '1234', '!!!', 'x'.repeat(81), '<script>']) expect(validateOrgName(n), n).not.toBeNull();
  });
  it('usuario de Qhub', () => { expect(validateUsername('notaria12')).toBeNull(); expect(validateUsername('ana.g_1')).toBeNull(); for (const u of ['ab', 'Ana', 'con espacio', '-x', 'x'.repeat(31), 'ñandu']) expect(validateUsername(u), u).not.toBeNull(); });
});

describe('contraseña', () => {
  it('rechaza claves comunes, repetidas y las que contienen el correo; acepta las buenas', () => {
    for (const p of ['12345678', 'Password1'.toLowerCase(), 'abcd1234', 'aaaaaaaa1'.replace('1', 'a')]) expect(validatePassword(p), p).not.toBeNull();
    expect(validatePassword('pena12345', { email: 'pena@x.co' })).toMatch(/correo/);
    for (const p of ['Taza-azul-77', 'mi clave larga 2026', 'xK9#mQ2v']) expect(validatePassword(p, { email: 'ana@x.co' }), p).toBeNull();
  });
  it('tope de 72 y la regla básica del móvil no aplica el filtro de comunes', () => {
    expect(validatePassword('a1'.repeat(37))).toBe('Usa 72 caracteres como máximo.');
    expect(validatePassword('12345678', { mixed: false })).toBeNull();
  });
});


describe('generatePassword', () => {
  it('genera contraseñas que pasan la validación, distintas cada vez y del largo pedido', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) { const p = generatePassword(); expect(p).toHaveLength(14); expect(validatePassword(p, { email: 'a@b.co' })).toBeNull(); seen.add(p); }
    expect(seen.size).toBe(50);
    expect(generatePassword(20)).toHaveLength(20);
  });
});
