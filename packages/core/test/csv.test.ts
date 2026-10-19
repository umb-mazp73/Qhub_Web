import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from '../src';

describe('csv', () => {
  it('escapa comas, comillas y saltos de línea solo cuando hace falta', () => {
    expect(csvField('simple')).toBe('simple'); expect(csvField('a,b')).toBe('"a,b"'); expect(csvField('di "hola"')).toBe('"di ""hola"""'); expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField(null)).toBe(''); expect(csvField(undefined)).toBe(''); expect(csvField(0)).toBe('0');
  });
  it('arma filas, respeta las ya armadas y termina con salto de línea', () => {
    expect(toCsv(['a,b', [1, 'x,y', null]])).toBe('a,b\n1,"x,y",\n');
    expect(toCsv([])).toBe('\n');
  });
});
