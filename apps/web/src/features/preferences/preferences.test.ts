import { describe, expect, it } from 'vitest';
import { applyPreferences, DEFAULT_PREFERENCES, loadPreferences } from '@/features/preferences/preferences';

describe('preferencias', () => {
  it('se guardan, se leen y se aplican al documento', () => {
    localStorage.clear();
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    applyPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark', largeText: true, reduceMotion: true });
    const h = document.documentElement;
    expect([h.dataset.theme, h.dataset.text, h.dataset.motion, h.dataset.contrast]).toEqual(['dark', 'large', 'reduce', undefined]);
    expect(loadPreferences().largeText).toBe(true);
    applyPreferences(DEFAULT_PREFERENCES);
    expect(h.getAttribute('data-theme')).toBeNull();
  });
  it('un JSON dañado vuelve a los valores por defecto', () => { localStorage.setItem('qhub.prefs', '{no'); expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES); });
});
