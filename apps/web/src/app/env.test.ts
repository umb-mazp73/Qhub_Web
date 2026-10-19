import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/app/env';

describe('parseEnv', () => {
  it('lee los valores y aplica default de VITE_APP_ENV', () => {
    const e = parseEnv({ VITE_QHUB_API_BASE_URL: 'a', VITE_QHUB_WS_BASE_URL: 'b', VITE_SUPABASE_URL: 'c', VITE_SUPABASE_PUBLISHABLE_KEY: 'd' });
    expect(e.appEnv).toBe('production');
    expect(e.supabaseKey).toBe('d');
  });
  it('falla con mensaje claro si falta una variable', () => {
    expect(() => parseEnv({ VITE_QHUB_API_BASE_URL: 'a' })).toThrow(/VITE_QHUB_WS_BASE_URL/);
  });
});
