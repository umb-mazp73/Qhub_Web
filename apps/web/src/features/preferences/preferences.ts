export type ThemeMode = 'system' | 'light' | 'dark';

/** Preferencias de la persona en este navegador (accesibilidad y apariencia). */
export interface Preferences { theme: ThemeMode; largeText: boolean; reduceMotion: boolean; highContrast: boolean; refreshSeconds: RefreshSeconds }
/** Cada cuánto se actualizan solos los datos de las pantallas (0 = solo a mano). */
export const REFRESH_OPTIONS = [0, 5, 10, 20, 30, 60] as const;
export type RefreshSeconds = (typeof REFRESH_OPTIONS)[number];
export const refreshLabel = (s: RefreshSeconds): string => (s === 0 ? 'Solo a mano' : s === 60 ? 'Cada minuto' : `Cada ${s} s`);
export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', largeText: false, reduceMotion: false, highContrast: false, refreshSeconds: 30 };

const KEY = 'qhub.prefs';
const LEGACY_THEME = 'qhub.theme';

export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Preferences>;
      return {
        theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
        largeText: p.largeText === true, reduceMotion: p.reduceMotion === true, highContrast: p.highContrast === true,
        refreshSeconds: (REFRESH_OPTIONS as readonly unknown[]).includes(p.refreshSeconds) ? (p.refreshSeconds as RefreshSeconds) : DEFAULT_PREFERENCES.refreshSeconds,
      };
    }
    const legacy = localStorage.getItem(LEGACY_THEME);
    if (legacy === 'light' || legacy === 'dark') return { ...DEFAULT_PREFERENCES, theme: legacy };
  } catch { /* sin storage o JSON dañado */ }
  return { ...DEFAULT_PREFERENCES };
}

/** Aplica las preferencias al documento (atributos que lee `ui.css`) y las guarda. */
export function applyPreferences(p: Preferences, root: HTMLElement = document.documentElement) {
  if (p.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', p.theme);
  const flag = (name: string, on: boolean, value: string) => { if (on) root.setAttribute(name, value); else root.removeAttribute(name); };
  flag('data-text', p.largeText, 'large');
  flag('data-motion', p.reduceMotion, 'reduce');
  flag('data-contrast', p.highContrast, 'more');
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* sin storage */ }
  current = p;
  listeners.forEach((l) => l());
}

// Almacén observable para que los componentes reaccionen al cambiar una preferencia (useSyncExternalStore).
let current: Preferences | null = null;
const listeners = new Set<() => void>();
export const subscribePreferences = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const getPreferences = (): Preferences => (current ??= loadPreferences());

// Compatibilidad con quien solo maneja el tema.
export const loadTheme = (): ThemeMode => loadPreferences().theme;
export const applyTheme = (theme: ThemeMode) => applyPreferences({ ...loadPreferences(), theme });
