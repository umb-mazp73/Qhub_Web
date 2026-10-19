import { describe, expect, it } from 'vitest';
import { timeAgo } from '../src';

describe('formatos', () => {
  it('timeAgo', () => {
    const now = new Date(2026, 9, 17, 12, 0, 0);
    expect(timeAgo(new Date(now.getTime() - 10_000), now)).toBe('ahora'); expect(timeAgo(new Date(now.getTime() - 5 * 60_000), now)).toBe('hace 5 min');
    expect(timeAgo(new Date(now.getTime() - 3 * 3600_000), now)).toBe('hace 3 h'); expect(timeAgo(new Date(2026, 9, 16, 9), now)).toBe('ayer'); expect(timeAgo(new Date(2026, 9, 13, 9), now)).toBe('hace 4 días');
  });
});
