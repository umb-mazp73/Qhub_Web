/** Lectura de variables públicas del `.env` (`VITE_*` en la web, `EXPO_PUBLIC_*` en el móvil). Nunca claves secretas. */
export type EnvSource = Record<string, string | undefined>;

export function requireEnv(source: EnvSource, key: string): string {
  const v = source[key]?.trim();
  if (!v) throw new Error(`Falta ${key} en el archivo .env`);
  return v;
}
export const optionalEnv = (source: EnvSource, key: string, fallback: string): string => source[key]?.trim() || fallback;
