import { optionalEnv, requireEnv, type EnvSource } from '@qhub/core';

/** Variables públicas (`VITE_*`). Nunca claves secretas: esas viven en `.env.secret`, fuera de la app. */
export interface AppEnv { appEnv: string; apiBaseUrl: string; wsBaseUrl: string; supabaseUrl: string; supabaseKey: string }

export const parseEnv = (m: EnvSource): AppEnv => ({
  appEnv: optionalEnv(m, 'VITE_APP_ENV', 'production'),
  apiBaseUrl: requireEnv(m, 'VITE_QHUB_API_BASE_URL'),
  wsBaseUrl: requireEnv(m, 'VITE_QHUB_WS_BASE_URL'),
  supabaseUrl: requireEnv(m, 'VITE_SUPABASE_URL'),
  supabaseKey: requireEnv(m, 'VITE_SUPABASE_PUBLISHABLE_KEY'),
});
