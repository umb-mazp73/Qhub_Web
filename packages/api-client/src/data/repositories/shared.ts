/** Ayudas de lectura del cuerpo JSON de la API, comunes a los repositorios. */
export type J = Record<string, unknown>;
export const list = (b: unknown) => (Array.isArray(b) ? (b as J[]) : []);
export const obj = (b: unknown) => (b ?? {}) as J;
