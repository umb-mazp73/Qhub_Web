import { describe, expect, it } from 'vitest';
import { isValidQueuePrefix, suggestQueuePrefixes } from '../src';

describe('suggestQueuePrefixes', () => {
  it('propone la primera letra y variantes naturales del nombre', () => {
    expect(suggestQueuePrefixes('Caja 1')).toEqual(expect.arrayContaining(['C', 'CA', 'CJ']));
    expect(suggestQueuePrefixes('Atención al cliente')[0]).toBe('A');
    expect(suggestQueuePrefixes('Atención al cliente')).toContain('AC');            // iniciales sin "al"
    expect(suggestQueuePrefixes('Ñandú')[0]).toBe('N');                            // sin tildes ni eñes sueltas
  });
  it('no repite los prefijos que ya usan otras colas y cae al siguiente', () => {
    expect(suggestQueuePrefixes('Atención al cliente', ['A'])[0]).toBe('AC');
    expect(suggestQueuePrefixes('Caja', ['c', 'CA'])[0]).toBe('CJ');
    expect(suggestQueuePrefixes('Caja', ['C', 'CA', 'CJ'])).not.toContain('C');
  });
  it('siempre devuelve algo válido, incluso sin letras en el nombre', () => {
    const s = suggestQueuePrefixes('123 ***');
    expect(s.length).toBeGreaterThan(0); expect(s.every(isValidQueuePrefix)).toBe(true);
    expect(suggestQueuePrefixes('', ['A'])[0]).toBe('B');
  });
  it('respeta el máximo y valida el formato', () => {
    expect(suggestQueuePrefixes('Escrituras', [], 2)).toHaveLength(2);
    expect(isValidQueuePrefix('AB')).toBe(true); expect(isValidQueuePrefix('abc')).toBe(false); expect(isValidQueuePrefix('1')).toBe(false); expect(isValidQueuePrefix('')).toBe(false);
  });
});
