// Genera tokens, íconos y logos desde el design system (tokens/tokens.json + assets/*.svg).
// Uso: npm run generate -w @qhub/design
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens/tokens.json'), 'utf8'));

const camel = (n) => n.split(/[-_.]/).map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1))).join('');
const kebab = (n) => n;
const hex = (v) => {
  let h = v.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (h.length === 6) return `#${h.toLowerCase()}`;
  if (h.length === 8) return `#${h.toLowerCase()}`; // RRGGBBAA (CSS y RN lo entienden)
  throw new Error(`Color no soportado: ${v}`);
};

// ---- colores (alias resueltos, por tema) ----
const themes = tokens.color.themes.map((t) => t.id);
const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t]));
const resolve = (name, theme, depth = 0) => {
  if (depth > 8) throw new Error(`Alias circular: ${name}`);
  const raw = byName[name].value;
  const v = typeof raw === 'object' ? raw[theme] ?? raw[themes[0]] : raw;
  return v.startsWith('{') ? resolve(v.slice(1, -1), theme, depth + 1) : hex(v);
};
const colors = Object.fromEntries(themes.map((th) => [th, Object.fromEntries(Object.keys(byName).map((n) => [camel(n), resolve(n, th)]))]));
const usage = Object.fromEntries(Object.keys(byName).map((n) => [camel(n), byName[n].usage]));

const px = (v) => Number(String(v).replace('px', '').replace('%', ''));
const group = (key, prefix = '') => Object.fromEntries(tokens[key].tokens.map((t) => {
  let k = camel(t.name.replace(prefix, ''));
  if (/^[0-9]/.test(k)) k = `s${k}`;
  return [k, String(t.value).includes('%') ? 999 : px(t.value)];
}));
const spacing = group('spacing', 'spacing-');
const size = group('size');
const radius = group('radius', 'radius-');

const text = {};
for (const g of tokens.type.groups) {
  for (const s of g.styles) {
    text[camel(s.name)] = {
      family: g.family === 'mono' ? 'mono' : 'sans',
      fontSize: px(s.fontSize), lineHeight: px(s.lineHeight), fontWeight: s.fontWeight,
      letterSpacing: s.letterSpacing ? px(s.letterSpacing) : 0,
    };
  }
}

const header = '// GENERADO por scripts/generate.mjs desde tokens/tokens.json y assets/. No editar a mano.\n';
const j = (o) => JSON.stringify(o, null, 2);

writeFileSync(join(root, 'src/tokens.generated.ts'), `${header}
export const colors = ${j(colors)} as const;

export type ColorName = keyof typeof colors.light;
export type ColorTokens = { readonly [K in ColorName]: string };
export type ThemeName = keyof typeof colors;

/** Para qué sirve cada token de color (del design system). */
export const colorUsage: Record<ColorName, string> = ${j(usage)};

export const spacing = ${j(spacing)} as const;
export const size = ${j(size)} as const;
export const radius = ${j(radius)} as const;

export interface TextStyleToken { family: 'sans' | 'mono'; fontSize: number; lineHeight: number; fontWeight: number; letterSpacing: number }
export const text = ${j(text)} as Record<string, TextStyleToken> as {
${Object.keys(text).map((k) => `  ${k}: TextStyleToken;`).join('\n')}
};
`);

// ---- CSS para la web ----
const shadowOverlay = tokens.shadow.tokens.find((t) => t.name === 'shadow-overlay').value;
const cssVars = (th) => `  --shadow-overlay: ${shadowOverlay[th]};\n` + Object.entries(colors[th]).map(([k, v]) => `  --${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/([a-z])(\d)/g, '$1-$2')}: ${v};`).join('\n');
const staticVars = [
  ...Object.entries(spacing).map(([k, v]) => `  --space-${k.replace(/^s0*/, '')}: ${v}px;`),
  ...Object.entries(size).map(([k, v]) => `  --${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}: ${v}px;`),
  ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v === 999 ? '50%' : v + 'px'};`),
  '  --sidebar-collapsed: 48px;   /* sidebar-width "(48 px colapsada)" según el design system */',
  '  --font-sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;',
  '  --font-mono: "IBM Plex Mono", Menlo, Consolas, monospace;',
].join('\n');
writeFileSync(join(root, 'src/tokens.css'), `/* ${header.trim()} */
:root {
${cssVars('light')}
${staticVars}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${cssVars('dark')}
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
${cssVars('dark')}
  color-scheme: dark;
}
`);

// ---- tema de Tailwind (v4) para la web: los tokens como utilidades ----
const kebabName = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/([a-z])(\d)/g, '$1-$2');
const themeColors = Object.keys(colors.light).map((k) => `  --color-${kebabName(k)}: var(--${kebabName(k)});`).join('\n');
const plainKebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const textUtilities = Object.entries(text).map(([k, t]) => `@utility t-${plainKebab(k)} {\n  font-family: var(--font-${t.family});\n  font-size: ${t.fontSize}px;\n  line-height: ${t.lineHeight}px;\n  font-weight: ${t.fontWeight};\n  letter-spacing: ${t.letterSpacing}px;\n}`).join('\n');
const sizeUtilities = Object.entries(size).map(([k, v]) => {
  const n = kebabName(k);
  return n.startsWith('control-') ? `@utility h-${n} {\n  height: ${v}px;\n}\n@utility min-h-${n} {\n  min-height: ${v}px;\n}\n@utility w-${n} {\n  width: ${v}px;\n}` : n === 'header-height' ? `@utility h-header {\n  height: ${v}px;\n}` : n === 'sidebar-width' ? `@utility w-sidebar {\n  width: ${v}px;\n}\n@utility w-sidebar-collapsed {\n  width: 48px;\n}` : n === 'row-height' ? `@utility h-row {\n  height: ${v}px;\n}\n@utility min-h-row {\n  min-height: ${v}px;\n}` : '';
}).filter(Boolean).join('\n');
writeFileSync(join(root, 'src/tailwind.css'), `/* ${header.trim()} */
@theme inline {
${themeColors}
  --font-sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "IBM Plex Mono", Menlo, Consolas, monospace;
  --radius-sm: ${radius.sm}px;
  --radius-md: ${radius.md}px;
  --shadow-overlay: var(--shadow-overlay);
}

${textUtilities}

${sizeUtilities}
`);

// ---- NativeWind (móvil): variables, clases de color y utilidades tipográficas ----
// En el repo web-only no existe apps/mobile: se omiten las salidas específicas del móvil.
const mobileDir = join(root, '../../apps/mobile');
const hasMobile = existsSync(mobileDir);
const kvars = (th) => Object.entries(colors[th]).map(([k, v]) => `  --${kebabName(k)}: ${v};`).join('\n');
if (hasMobile) writeFileSync(join(mobileDir, 'global.css'), `/* ${header.trim()} */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
${kvars('light')}
}
@media (prefers-color-scheme: dark) {
  :root {
${kvars('dark')}
  }
}
`);
const names = Object.keys(colors.light);
const cls = (prefix) => `{\n${names.map((n) => `  ${n}: '${prefix}-${kebabName(n)}',`).join('\n')}\n}`;
writeFileSync(join(root, 'src/tw-classes.generated.ts'), `${header}// Clases literales (Tailwind solo genera lo que ve escrito): una por token de color.
import type { ColorName } from './tokens.generated';

export const textClass: Record<ColorName, string> = ${cls('text')};
export const bgClass: Record<ColorName, string> = ${cls('bg')};
export const borderClass: Record<ColorName, string> = ${cls('border')};
`);
const tailwindColors = Object.fromEntries(names.map((n) => [kebabName(n), `var(--${kebabName(n)})`]));
if (hasMobile) writeFileSync(join(mobileDir, 'tailwind.tokens.generated.js'), `${header}module.exports = {
  colors: ${JSON.stringify(tailwindColors, null, 2)},
  text: ${JSON.stringify(Object.fromEntries(Object.entries(text).map(([k, t]) => [plainKebab(k), t])), null, 2)},
  radius: ${JSON.stringify(radius)},
  size: ${JSON.stringify(size)},
};
`);

// ---- íconos y logos ----
const fileMap = (dir, transform) => Object.fromEntries(readdirSync(join(root, 'assets', dir)).filter((f) => f.endsWith('.svg')).sort()
  .map((f) => [f.replace('.svg', ''), transform(readFileSync(join(root, 'assets', dir, f), 'utf8').trim())]));
const icons = fileMap('icons', (s) => s.replace(/#161A2E/gi, 'currentColor').replace(/ width="16" height="16"/, ''));
const logos = fileMap('logos', (s) => s);
writeFileSync(join(root, 'src/icons.generated.ts'), `${header}
export const icons = ${j(icons)} as const;
export type IconName = keyof typeof icons;
export const iconNames = Object.keys(icons) as IconName[];

export const logos = ${j(logos)} as const;
export type LogoName = keyof typeof logos;
`);
console.log(`OK: ${Object.keys(colors.light).length} colores, ${Object.keys(icons).length} íconos, ${Object.keys(logos).length} logos`);
