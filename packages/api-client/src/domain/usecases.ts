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

/** Cita (reservada) cuya hora todavía no llega: no se llama sola. */
export const isFutureAppointment = (t: Ticket, now: Date = new Date()): boolean => t.scheduled && t.slotStart.getTime() > now.getTime();

/** Grupo de prioridad en la fila: 0 = cita cuya hora ya llegó · 1 = turno «ahora» (por orden de llegada) · 2 = cita que aún no llega. */
const waitingGroup = (t: Ticket, now: Date) => (t.scheduled ? (isFutureAppointment(t, now) ? 2 : 0) : 1);

/**
 * Orden de la fila de atención: atendiendo primero y luego los que esperan por prioridad:
 * 1) citas cuya hora ya llegó (por su hora), 2) turnos «ahora» (por llegada), 3) citas que aún no llegan (por su hora).
 */
export function sortWaitingRoom(tickets: readonly Ticket[], now: Date = new Date()): Ticket[] {
  return tickets.filter((t) => isActiveStatus(t.status)).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'atendiendo' ? -1 : 1;
    if (a.status === 'atendiendo') return (a.calledAt?.getTime() ?? 0) - (b.calledAt?.getTime() ?? 0) || a.position - b.position;
    const ga = waitingGroup(a, now), gb = waitingGroup(b, now);
    if (ga !== gb) return ga - gb;
    if (ga === 1) { const byArrival = a.createdAt.getTime() - b.createdAt.getTime(); if (byArrival !== 0) return byArrival; }
    return a.slotStart.getTime() - b.slotStart.getTime() || a.position - b.position;
  });
}

/** Siguiente a llamar: el primero de la fila que se puede llamar ya. Una cita que aún no llega nunca se llama sola. */
export const nextToCall = (tickets: readonly Ticket[], now: Date = new Date()): Ticket | null =>
  sortWaitingRoom(tickets, now).find((t) => t.status === 'en_espera' && !isFutureAppointment(t, now)) ?? null;

/** Próxima cita que todavía no llega (para decir «la siguiente es a las 10:30»). */
export const nextAppointment = (tickets: readonly Ticket[], now: Date = new Date()): Ticket | null =>
  sortWaitingRoom(tickets, now).find((t) => t.status === 'en_espera' && isFutureAppointment(t, now)) ?? null;

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
