import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * La Clean Architecture ya no se ve en carpetas (cada feature es una sola carpeta); se reconoce por el nombre del archivo:
 *   · `*.tsx`, `use*.ts` y `hooks.ts`   → presentación (React)
 *   · `supabase-*.ts`                   → datos (adaptadores: Supabase, fetch)
 *   · cualquier otro `.ts`              → dominio: TypeScript puro, sin React, sin Supabase, sin fetch
 * Las dependencias van siempre hacia adentro: el dominio nunca importa presentación ni datos.
 */
const root = join(__dirname, 'features');
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(root).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const base = (f: string) => f.split('/').pop()!;
const isPresentation = (f: string) => /^use[A-Z]/.test(base(f)) || base(f) === 'hooks.ts';
const isData = (f: string) => base(f).startsWith('supabase-') || /-(vault|store)\.ts$/.test(base(f)) && base(f).startsWith('device-') || base(f) === 'session-token-store.ts';
const domain = files.filter((f) => !isPresentation(f) && !isData(f));
const imports = (f: string) => [...readFileSync(f, 'utf8').matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

describe('arquitectura por nombre de archivo', () => {
  it('hay dominio que comprobar', () => { expect(domain.length).toBeGreaterThan(20); });

  it('el dominio es TypeScript puro: sin React, Supabase, router ni fetch', () => {
    const bad: string[] = [];
    for (const f of domain) {
      const src = readFileSync(f, 'utf8');
      for (const i of imports(f)) if (/^(react|react-dom|react-router-dom|@tanstack\/react-query|@supabase\/.+)$/.test(i)) bad.push(`${relative(root, f)} importa ${i}`);
      if (/\bfetch\(/.test(src)) bad.push(`${relative(root, f)} usa fetch`);
    }
    expect(bad).toEqual([]);
  });

  it('el dominio no depende de la presentación ni de los adaptadores de datos', () => {
    const bad: string[] = [];
    for (const f of domain) for (const i of imports(f)) {
      const name = i.split('/').pop()!;
      if (i.startsWith('.') || i.startsWith('@/')) {
        if (/^(use[A-Z].*|hooks)$/.test(name) || name.startsWith('supabase-') || /[A-Z][A-Za-z]+(Page|Dialog|Tab|Row|Bell)$/.test(name)) bad.push(`${relative(root, f)} importa ${i}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('los adaptadores de datos no importan pantallas', () => {
    const bad: string[] = [];
    for (const f of files.filter(isData)) for (const i of imports(f)) if ((i.startsWith('.') || i.startsWith('@/features')) && /^[A-Z]/.test(i.split('/').pop()!)) bad.push(`${relative(root, f)} importa ${i}`);
    expect(bad).toEqual([]);
  });
});
