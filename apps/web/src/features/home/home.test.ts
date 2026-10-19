import { describe, expect, it } from 'vitest';
import { greeting, setupSteps, summaryLine } from './home';
import { computeStats } from '@/features/history/history';

describe('inicio', () => {
  it('saludo según la hora', () => {
    expect(greeting(new Date(2026, 9, 17, 9))).toBe('Buenos días'); expect(greeting(new Date(2026, 9, 17, 15))).toBe('Buenas tardes'); expect(greeting(new Date(2026, 9, 17, 22))).toBe('Buenas noches');
  });
  it('lista de arranque según el rol y el tipo de cuenta', () => {
    const base = { admin: true, profileComplete: false, mfaEnabled: false, orgLocated: true, hasQueues: true, published: false, teamSize: 1 };
    expect(setupSteps(base).map((x) => x.done)).toEqual([false, false, true, true, false, false]);
    expect(setupSteps({ ...base, admin: false }).map((x) => x.id)).toEqual(['profile', 'mfa']);          // un agente solo ve lo personal
    expect(setupSteps({ ...base, personal: true }).map((x) => x.id)).not.toContain('team');
    expect(setupSteps({ ...base, profileComplete: true, mfaEnabled: true, published: true, teamSize: 3 }).every((x) => x.done)).toBe(true);
  });
  it('frase de resumen', () => {
    const none = computeStats([]);
    expect(summaryLine(false, false, none, 0)).toBe('Todavía no hay colas activas.'); expect(summaryLine(false, false, none, 2)).toBe('2 colas activas en este momento.');
    expect(summaryLine(true, true, none, 1)).toMatch(/Cargando/); expect(summaryLine(true, false, none, 0)).toMatch(/Crea una cola/); expect(summaryLine(true, false, none, 1)).toMatch(/Aún no hay turnos hoy/);
  });
});
