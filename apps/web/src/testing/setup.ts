import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// El árbol completo (AppRoutes + shell) tarda más en pintar cuando toda la suite corre en paralelo
// bajo carga; el default de 1 s de las utilidades asíncronas se queda corto de forma intermitente.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// jsdom no trae matchMedia ni scrollIntoView
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
Element.prototype.scrollIntoView ||= () => {};
