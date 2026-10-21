import { describe, expect, it, vi } from 'vitest';
import {
  applyQueueEvent, capacityPerSlot, createQueue, inQueueTime, isFutureAppointment, isValidHm, nextAppointment, nextToCall, normalizeHm, peopleAhead, queueUtcOffsetMinutes,
  releasesSlot, replaceSchedule, sortWaitingRoom, summarizeSchedule, validateSchedule, type QueueRepository, type ScheduleInput, type Slot, type Ticket, type TicketStatus,
} from '../src';
import { ok } from '@qhub/core';

const base: ScheduleInput = { opens: '08:00', closes: '18:00', slotMinutes: 30, days: [1, 2], turnMinutes: 10, maxDaysAhead: 7 };

const t = (id: string, status: TicketStatus, o: Partial<Ticket> = {}): Ticket => ({
  id, queueId: 'q', ownerName: 'o', userId: 'u', slotStart: new Date('2026-10-20T15:00:00Z'), scheduled: false, number: 1, status, position: 1,
  createdAt: new Date('2026-10-20T14:00:00Z'), calledAt: null, finishedAt: null, agentId: null, ...o,
});

describe('validateSchedule', () => {
  it('acepta un horario coherente', () => expect(validateSchedule(base)).toBeNull());
  it('rechaza lo incoherente', () => {
    expect(validateSchedule({ ...base, opens: '18:00', closes: '08:00' })).toMatch(/posterior/);
    expect(validateSchedule({ ...base, slotMinutes: 15, turnMinutes: 20 })).toMatch(/más largo/);
    expect(validateSchedule({ ...base, days: [] })).not.toBeNull();
    expect(validateSchedule({ ...base, days: [8] })).not.toBeNull();
  });
  it('cupos por franja = floor(franja/trámite) × puestos', () => {
    expect(capacityPerSlot(base)).toBe(3);
    expect(capacityPerSlot({ ...base, stations: 2 })).toBe(6);
    expect(capacityPerSlot({ ...base, turnMinutes: 20 })).toBe(1);
  });
});

describe('casos de uso de colas', () => {
  const repo = (): QueueRepository => ({ create: vi.fn(async () => ok({ id: 'q', ownerName: 'o', name: 'Caja', description: null, active: true })), replaceSchedule: vi.fn() } as unknown as QueueRepository);
  it('no llama a la red si el horario es inválido', async () => {
    const r = repo();
    const res = await createQueue(r, { name: 'Caja', schedule: { ...base, opens: '18:00', closes: '08:00' } });
    expect(res.ok).toBe(false);
    expect(r.create).not.toHaveBeenCalled();
  });
  it('rechaza nombre vacío y delega cuando es válido', async () => {
    expect((await createQueue(repo(), { name: '  ' })).ok).toBe(false);
    const r = repo();
    expect((await createQueue(r, { name: 'Caja', schedule: base })).ok).toBe(true);
    expect(r.create).toHaveBeenCalledOnce();
  });
  it('replaceSchedule valida antes', async () => {
    const r = repo();
    expect((await replaceSchedule(r, 'q', { ...base, days: [] })).ok).toBe(false);
    expect(r.replaceSchedule).not.toHaveBeenCalled();
  });
});

describe('resumen del horario', () => {
  it('calcula franjas, cupos y turnos', () => {
    expect(summarizeSchedule({ ...base, opens: '08:00', closes: '17:00', days: [1, 2, 3, 4, 5], stations: 2 })).toEqual({ slotsPerDay: 18, capacityPerSlot: 6, turnsPerDay: 108, turnsPerWeek: 540 });
  });
  it('el tope diario recorta', () => expect(summarizeSchedule({ ...base, dailyCapacity: 20 }).turnsPerDay).toBe(20));
  it('horas', () => {
    expect(isValidHm('8:00')).toBe(true);
    expect(isValidHm('24:00')).toBe(false);
    expect(normalizeHm('8:05')).toBe('08:05');
  });
});

describe('fila de atención', () => {
  const a = t('a', 'en_espera', { position: 2 });
  const b = t('b', 'en_espera', { position: 1 });
  const c = t('c', 'atendiendo', { position: 0 });
  const d = t('d', 'finalizado');
  const later = t('e', 'en_espera', { position: 1, slotStart: new Date('2026-10-20T16:00:00Z') });
  it('atendiendo primero, luego franja y posición; excluye cerrados', () => expect(sortWaitingRoom([a, later, d, b, c]).map((x) => x.id)).toEqual(['c', 'b', 'a', 'e']));
  it('siguiente a llamar', () => { expect(nextToCall([a, b, c, later])?.id).toBe('b'); expect(nextToCall([c, d])).toBeNull(); });
  describe('prioridad de la fila: citas que ya llegaron → turnos ahora → citas futuras', () => {
    const now = new Date('2026-10-20T15:20:00Z');
    const ahoraViejo = t('ahora1', 'en_espera', { createdAt: new Date('2026-10-20T15:05:00Z'), slotStart: new Date('2026-10-20T15:00:00Z'), position: 1 });
    const ahoraNuevo = t('ahora2', 'en_espera', { createdAt: new Date('2026-10-20T15:15:00Z'), slotStart: new Date('2026-10-20T15:00:00Z'), position: 2 });
    const citaYaLlego = t('cita-ya', 'en_espera', { scheduled: true, slotStart: new Date('2026-10-20T15:10:00Z'), position: 3 });
    const citaFutura = t('cita-futura', 'en_espera', { scheduled: true, slotStart: new Date('2026-10-20T15:30:00Z'), position: 1 });
    it('una cita cuya hora ya llegó pasa antes que los turnos ahora', () => {
      expect(sortWaitingRoom([ahoraViejo, ahoraNuevo, citaFutura, citaYaLlego], now).map((x) => x.id)).toEqual(['cita-ya', 'ahora1', 'ahora2', 'cita-futura']);
      expect(nextToCall([ahoraViejo, citaYaLlego], now)?.id).toBe('cita-ya');
    });
    it('los turnos ahora salen por orden de llegada', () => expect(nextToCall([ahoraNuevo, ahoraViejo], now)?.id).toBe('ahora1'));
    it('una cita que aún no llega no se llama sola, y se informa cuál es la próxima', () => {
      expect(nextToCall([citaFutura], now)).toBeNull();
      expect(nextAppointment([citaFutura, ahoraViejo], now)?.id).toBe('cita-futura');
      expect(isFutureAppointment(citaFutura, now)).toBe(true);
      expect(nextToCall([citaFutura, ahoraNuevo], now)?.id).toBe('ahora2');
    });
    it('cuando llega la hora de la cita pasa a ser llamable', () => expect(nextToCall([citaFutura], new Date('2026-10-20T15:30:00Z'))?.id).toBe('cita-futura'));
  });
  it('reducer de eventos inserta y reemplaza', () => {
    const upd = applyQueueEvent([a, b], { type: 'turno_llamado', queueId: 'q', ticket: t('a', 'atendiendo') });
    expect(upd).toHaveLength(2);
    expect(upd.find((x) => x.id === 'a')?.status).toBe('atendiendo');
    expect(applyQueueEvent([a], { type: 'turno_creado', queueId: 'q', ticket: t('z', 'en_espera') })).toHaveLength(2);
    expect(applyQueueEvent([a], { type: 'cola_actualizada', queueId: 'q', ticket: null })).toEqual([a]);
  });
  it('personas delante', () => expect(peopleAhead(t('m', 'en_espera', { position: 3 }), [a, b, c, d, later])).toBe(3));
  it('solo cancelado y no-show liberan cupo', () => {
    expect((['en_espera', 'atendiendo', 'finalizado', 'cancelado', 'no_show'] as TicketStatus[]).filter(releasesSlot)).toEqual(['cancelado', 'no_show']);
  });
});

describe('hora de la cola', () => {
  const slot = (iso: string): Slot => ({ start: new Date(iso), end: new Date(iso), capacity: 3, taken: 0, available: 3 });
  it('deduce UTC-5 cuando la apertura 08:00 es 13:00Z', () => {
    const off = queueUtcOffsetMinutes({ opens: '08:00:00' }, [slot('2026-10-20T13:30:00Z'), slot('2026-10-20T13:00:00Z')]);
    expect(off).toBe(-300);
    expect(inQueueTime(new Date('2026-10-20T14:30:00Z'), off!).getUTCHours()).toBe(9);
  });
  it('desfases positivos y cero; sin franjas no hay desfase', () => {
    expect(queueUtcOffsetMinutes({ opens: '08:00:00' }, [slot('2026-10-20T07:00:00Z')])).toBe(60);
    expect(queueUtcOffsetMinutes({ opens: '08:00:00' }, [slot('2026-10-20T08:00:00Z')])).toBe(0);
    expect(queueUtcOffsetMinutes({ opens: '08:00:00' }, [])).toBeNull();
  });
});
