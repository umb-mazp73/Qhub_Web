import { describe, expect, it } from 'vitest';
import { fromDateInput, toDateInput } from '../src';

describe('fechas de <input type="date">', () => {
  it('ida y vuelta en hora local', () => {
    expect(toDateInput(new Date(2026, 9, 7))).toBe('2026-10-07');
    const d = fromDateInput('2026-10-07')!; expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 7]);
  });
  it('rechaza formatos y fechas inexistentes', () => { expect(fromDateInput('')).toBeNull(); expect(fromDateInput('07/10/2026')).toBeNull(); expect(fromDateInput('2026-02-31')).toBeNull(); });
});
