import { describe, expect, it } from 'vitest';
import { colors, contrast, icons, iconNames, logos, radius, size, spacing, statusColors, text } from '../src';

describe('tokens', () => {
  it('los dos temas tienen los mismos tokens y difieren en superficie', () => {
    expect(Object.keys(colors.dark)).toEqual(Object.keys(colors.light));
    expect(colors.light.background).not.toBe(colors.dark.background);
    expect(colors.light.brandIndigo).toBe(colors.dark.brandIndigo);
  });
  it('alias resueltos y escalas de 8 px', () => {
    expect(colors.light.interactive).toBe(colors.light.brandIndigo);
    expect(spacing.s03).toBe(8);
    expect(size.controlMd).toBe(40);
    expect(size.controlLg).toBe(48);
    expect(radius.sm).toBe(2);
  });
  it('contraste AA de los textos principales en ambos temas', () => {
    for (const th of ['light', 'dark'] as const) {
      const c = colors[th];
      expect(contrast(c.textPrimary, c.layer01), `${th} texto`).toBeGreaterThan(4.5);
      expect(contrast(c.textSecondary, c.layer01), `${th} secundario`).toBeGreaterThan(4.5);
    }
    expect(contrast(colors.light.textOnColor, colors.light.interactive)).toBeGreaterThan(4.5);
    expect(contrast(colors.light.textOnAccent, colors.light.stateWaiting)).toBeGreaterThan(4.5);
    expect(contrast(colors.light.textOnAccent, colors.light.stateNoshow)).toBeGreaterThan(4.5);
  });
  it('tipografía: Plex, 400/500/600 y nunca 700', () => {
    expect(text.turnXl.family).toBe('mono');
    expect(text.body.family).toBe('sans');
    for (const s of Object.values(text)) expect(s.fontWeight).not.toBe(700);
  });
  it('colores de estado: uno por estado', () => {
    const fills = (['en_espera', 'atendiendo', 'finalizado', 'cancelado', 'no_show'] as const).map((s) => statusColors(s, colors.light).fill);
    expect(new Set(fills).size).toBe(5);
  });
});

describe('íconos y logos', () => {
  it('hay 35 íconos del set propio, tintables', () => {
    expect(iconNames).toHaveLength(35);
    for (const n of iconNames) {
      expect(icons[n]).toContain('<svg');
      expect(icons[n]).not.toContain('#161A2E');
    }
    expect(icons.bell).toContain('currentColor');
  });
  it('logos oficiales', () => {
    expect(Object.keys(logos)).toEqual(expect.arrayContaining(['qhub-horizontal', 'qhub-horizontal-negativo', 'qhub-icono', 'qhub-simbolo']));
  });
});
