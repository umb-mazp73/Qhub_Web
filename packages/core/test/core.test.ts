import { describe, expect, it } from 'vitest';
import {
  conflictFailure, defaultQueuePrefix, err, estimateWaitMinutes, formatHm, formatTurnNumber, guard, isFailure,
  mapResult, networkFailure, notFoundFailure, ok, trimSeconds, unwrap,
} from '../src';

describe('Result', () => {
  it('ok expone el valor y map transforma', () => {
    const r = ok(2);
    expect(r.ok).toBe(true);
    expect(mapResult(r, (v) => v * 3)).toEqual(ok(6));
  });
  it('err conserva el failure y unwrap lo lanza', () => {
    const r = err<number>(notFoundFailure());
    expect(r.ok).toBe(false);
    expect(mapResult(r, (v) => v * 2)).toBe(r);
    expect(() => unwrap(r)).toThrowError(/encontramos/);
  });
  it('guard convierte lo que se lanza', async () => {
    const r = await guard(async () => { throw new Error('x'); }, () => networkFailure());
    expect(!r.ok && r.failure.kind).toBe('network');
    expect(await guard(async () => 5, () => networkFailure())).toEqual(ok(5));
  });
});

describe('Failure', () => {
  it('lleva tipo y campos', () => {
    const f = conflictFailure('franja llena');
    expect(isFailure(f)).toBe(true);
    expect(f.kind).toBe('conflict');
    expect(isFailure(new Error('x'))).toBe(false);
  });
});

describe('turnos', () => {
  it('formatea con prefijo y tres dígitos', () => {
    expect(formatTurnNumber(23)).toBe('A-023');
    expect(formatTurnNumber(7, 'E')).toBe('E-007');
    expect(formatTurnNumber(1234, 'B')).toBe('B-1234');
  });
  it('prefijo por defecto', () => {
    expect(defaultQueuePrefix('Caja 1')).toBe('C');
    expect(defaultQueuePrefix('  órdenes')).toBe('R');
    expect(defaultQueuePrefix('123')).toBe('A');
  });
  it('estimación', () => {
    expect(estimateWaitMinutes({ peopleAhead: 0, turnMinutes: 3 })).toBe(0);
    expect(estimateWaitMinutes({ peopleAhead: 3, turnMinutes: 3 })).toBe(9);
    expect(estimateWaitMinutes({ peopleAhead: 3, turnMinutes: 10, stations: 2 })).toBe(20);
  });
  it('horas', () => {
    expect(formatHm(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
    expect(trimSeconds('08:00:00')).toBe('08:00');
  });
});
