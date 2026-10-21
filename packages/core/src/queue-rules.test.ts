import { describe, expect, it } from 'vitest';
import { DEFAULT_QUEUE_RULES, validateBreaks } from './queue-rules';

describe('validateBreaks', () => {
  it('acepta descansos dentro del horario y ordenados o no', () => {
    expect(validateBreaks([{ from: '13:00', to: '14:00' }], '09:00', '18:00')).toBeNull();
    expect(validateBreaks([{ from: '15:00', to: '15:15' }, { from: '12:00', to: '13:00' }], '09:00', '18:00')).toBeNull();
    expect(validateBreaks([], '09:00', '18:00')).toBeNull();
  });
  it('rechaza lo incoherente con un mensaje claro', () => {
    expect(validateBreaks([{ from: '14:00', to: '13:00' }], '09:00', '18:00')).toBe('El descanso debe terminar después de empezar.');
    expect(validateBreaks([{ from: '', to: '13:00' }], '09:00', '18:00')).toBe('Elige la hora de inicio y de fin de cada descanso.');
    expect(validateBreaks([{ from: '08:00', to: '09:30' }], '09:00', '18:00')).toContain('dentro del horario');
    expect(validateBreaks([{ from: '12:00', to: '13:30' }, { from: '13:00', to: '14:00' }], '09:00', '18:00')).toBe('Los descansos no pueden cruzarse.');
    expect(validateBreaks(Array.from({ length: 7 }, (_, i) => ({ from: `1${i}:00`, to: `1${i}:10` })), '09:00', '20:00')).toBe('Máximo 6 descansos.');
  });
  it('los valores por defecto coinciden con los del servidor', () => {
    expect(DEFAULT_QUEUE_RULES).toEqual({ breaks: [], nowMarginMinutes: 3, appointmentLeadMinutes: 5, maxActiveAppointments: 3 });
  });
});
