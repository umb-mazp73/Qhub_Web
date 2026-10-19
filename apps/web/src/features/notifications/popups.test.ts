import { describe, expect, it } from 'vitest';
import { freshNotices } from './popups';
import { makeNotice } from '@/testing/fakes';

describe('avisos emergentes', () => {
  it('solo los sin leer que no se mostraron, del más viejo al más nuevo', () => {
    const items = [
      makeNotice('n3', { createdAt: new Date('2026-10-18T12:03:00Z') }), makeNotice('n1', { createdAt: new Date('2026-10-18T12:01:00Z') }),
      makeNotice('n2', { read: true, createdAt: new Date('2026-10-18T12:02:00Z') }), makeNotice('n0', { createdAt: new Date('2026-10-18T12:00:00Z') }),
    ];
    expect(freshNotices(items, new Set(['n0'])).map((n) => n.id)).toEqual(['n1', 'n3']);
  });
});
