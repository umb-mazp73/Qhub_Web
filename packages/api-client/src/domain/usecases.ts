import { err, validationFailure, type Result } from '@qhub/core';
import { capacityPerSlot, isActiveStatus, type CreateQueueInput, type Queue, type QueueEvent, type Schedule, type ScheduleInput, type Ticket } from './entities';
import type { QueueRepository } from './repositories';

const mins = (t: string) => { const [h, m] = t.split(':'); return Number(h) * 60 + Number(m); };

/** Valida el horario antes de ir a la red (misma regla que la API). Devuelve el mensaje o null. */
export function validateSchedule(s: ScheduleInput): string | null {
  const stations = s.stations ?? 1;
  if (s.days.length === 0) return 'Elige al menos un día de atención.';
  if (s.days.some((d) => d < 1 || d > 7)) return 'Los días deben ir de 1 (lunes) a 7 (domingo).';
  if (mins(s.closes) <= mins(s.opens)) return 'El cierre debe ser posterior a la apertura.';
  if (s.slotMinutes < 5 || s.slotMinutes > 480) return 'La franja debe durar entre 5 y 480 minutos.';
  if (s.turnMinutes < 1) return 'El trámite debe durar al menos 1 minuto.';
  if (s.turnMinutes > s.slotMinutes) return 'El trámite no puede ser más largo que la franja.';
  if (stations < 1) return 'Los cupos deben ser mayores que 0.';
  if (s.maxDaysAhead < 0 || s.maxDaysAhead > 365) return 'La anticipación máxima va de 0 a 365 días.';
  return null;
}

export async function createQueue(queues: QueueRepository, input: CreateQueueInput): Promise<Result<Queue>> {
  if (input.name.trim() === '') return err(validationFailure('Escribe el nombre de la cola.'));
  if (input.schedule) {
    const e = validateSchedule(input.schedule);
    if (e) return err(validationFailure(e));
  }
  return queues.create(input);
}

export async function replaceSchedule(queues: QueueRepository, queueId: string, input: ScheduleInput): Promise<Result<Schedule>> {
  const e = validateSchedule(input);
  return e ? err(validationFailure(e)) : queues.replaceSchedule(queueId, input);
}

export interface ScheduleSummary { slotsPerDay: number; capacityPerSlot: number; turnsPerDay: number; turnsPerWeek: number }

/** Resumen derivado del horario que se muestra mientras el admin lo edita. */
export function summarizeSchedule(s: ScheduleInput): ScheduleSummary {
  const span = mins(s.closes) - mins(s.opens);
  const slots = span > 0 && s.slotMinutes > 0 ? Math.floor(span / s.slotMinutes) : 0;
  const perSlot = capacityPerSlot(s);
  let perDay = slots * perSlot;
  if ((s.dailyCapacity ?? 0) > 0 && (s.dailyCapacity ?? 0) < perDay) perDay = s.dailyCapacity ?? 0;
  return { slotsPerDay: slots, capacityPerSlot: perSlot, turnsPerDay: perDay, turnsPerWeek: perDay * s.days.length };
}

const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;
export const isValidHm = (v: string) => HM.test(v.trim());
export const normalizeHm = (v: string) => { const [h = '', m = ''] = v.trim().split(':'); return `${h.padStart(2, '0')}:${m}`; };

/** Orden de la fila de atención: atendiendo primero, luego por franja y posición. */
export function sortWaitingRoom(tickets: readonly Ticket[]): Ticket[] {
  return tickets.filter((t) => isActiveStatus(t.status)).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'atendiendo' ? -1 : 1;
    const bySlot = a.slotStart.getTime() - b.slotStart.getTime();
    return bySlot !== 0 ? bySlot : a.position - b.position;
  });
}

/** Siguiente a llamar: el primero `en_espera` de la franja más próxima. */
export const nextToCall = (tickets: readonly Ticket[]): Ticket | null => sortWaitingRoom(tickets).find((t) => t.status === 'en_espera') ?? null;

/** Reducer puro: aplica un evento en vivo a la lista de turnos. */
export function applyQueueEvent(current: readonly Ticket[], event: QueueEvent): Ticket[] {
  const t = event.ticket;
  if (!t) return [...current];
  const next = [...current];
  const i = next.findIndex((x) => x.id === t.id);
  if (i >= 0) next[i] = t; else next.push(t);
  return next;
}

/** Personas delante en la misma franja o anteriores. */
export function peopleAhead(mine: Ticket, queue: readonly Ticket[]): number {
  return queue.filter((t) => t.id !== mine.id && isActiveStatus(t.status) &&
    (t.slotStart.getTime() < mine.slotStart.getTime() || (t.slotStart.getTime() === mine.slotStart.getTime() && t.position < mine.position))).length;
}
