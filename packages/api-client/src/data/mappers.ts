import { isTicketStatusLike } from './guards';
import {
  parseTicketStatus, type AccountType, type AppNotification, type Queue, type QueueEvent, type QueueEventType, type QueueLimit, type QueueState,
  type Registration, type RegisterInput, type Schedule, type ScheduleInput, type Slot, type Ticket,
} from '../domain/entities';

type J = Record<string, unknown>;
const s = (v: unknown) => String(v);
const d = (v: unknown) => new Date(String(v));
const dn = (v: unknown) => (v == null ? null : new Date(String(v)));
const n = (v: unknown, fallback = 0) => (typeof v === 'number' ? v : fallback);

export const queueFromJson = (j: J): Queue => ({
  id: s(j.id), ownerName: s(j.propietario_nombre ?? ''), name: s(j.nombre),
  description: (j.descripcion as string | null | undefined) ?? null, active: Boolean(j.activa),
});

export const scheduleFromJson = (j: J): Schedule => ({
  queueId: s(j.cola_id), timeZone: s(j.zona_horaria), opens: s(j.hora_apertura), closes: s(j.hora_cierre),
  slotMinutes: n(j.duracion_franja_minutos), days: (j.dias_atencion as number[]) ?? [], turnMinutes: n(j.duracion_turno_minutos),
  stations: n(j.puestos, 1), dailyCapacity: n(j.capacidad_diaria), maxDaysAhead: n(j.dias_anticipacion_maxima),
  slotsPerDay: n(j.franjas_por_dia), capacityPerSlot: n(j.cupos_por_franja), turnsPerDay: n(j.turnos_por_dia),
});

const withSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t);

export const scheduleToJson = (x: ScheduleInput): J => ({
  hora_apertura: withSeconds(x.opens), hora_cierre: withSeconds(x.closes), duracion_franja_minutos: x.slotMinutes,
  dias_atencion: [...x.days], duracion_turno_minutos: x.turnMinutes, puestos: x.stations ?? 1, capacidad_diaria: x.dailyCapacity ?? 0,
  dias_anticipacion_maxima: x.maxDaysAhead, ...(x.timeZone ? { zona_horaria: x.timeZone } : {}),
});

export const slotFromJson = (j: J): Slot => ({ start: d(j.inicio), end: d(j.fin), capacity: n(j.cupos), taken: n(j.ocupados), available: n(j.disponibles) });
export const queueStateFromJson = (j: J): QueueState => ({ queueId: s(j.cola_id), waiting: n(j.turnos_en_espera), serving: n(j.turnos_atendiendo) });
export const queueLimitFromJson = (j: J): QueueLimit => ({
  accountType: (j.propietario_tipo === 'usuario' ? 'usuario' : 'empresa') as AccountType, limit: n(j.limite), active: n(j.activas), available: n(j.disponibles),
});

export const ticketFromJson = (j: J): Ticket => ({
  id: s(j.id), queueId: s(j.cola_id), ownerName: s(j.propietario_nombre ?? ''), userId: s(j.usuario_id), slotStart: d(j.franja_inicio),
  scheduled: Boolean(j.programado), number: n(j.numero), status: parseTicketStatus(s(j.estado)), position: n(j.posicion),
  createdAt: d(j.hora_creacion), calledAt: dn(j.hora_atencion), finishedAt: dn(j.hora_finalizacion), agentId: (j.agente_id as string | null | undefined) ?? null,
});

export const notificationFromJson = (j: J): AppNotification => ({
  id: s(j.id), userId: s(j.usuario_id ?? ''), ticketId: (j.turno_id as string | null | undefined) ?? null, message: s(j.mensaje),
  read: Boolean(j.leida), createdAt: d(j.creada_en), kind: (j.tipo_aviso as string | null | undefined) ?? null,
});

export const registrationFromJson = (j: J): Registration => ({
  accountType: (j.propietario_tipo === 'usuario' ? 'usuario' : 'empresa') as AccountType, accountId: s(j.propietario_id), username: s(j.nombre_usuario),
  email: s(j.email), companyName: (j.nombre_empresa as string | null | undefined) ?? null, queueLimit: n(j.limite_colas), createdAt: d(j.creada_en),
});

export const registerToJson = (i: RegisterInput): J => ({
  tipo_cuenta: i.accountType, ...(i.companyName ? { nombre_empresa: i.companyName } : {}), nombre: i.firstName, apellido: i.lastName,
  nombre_usuario: i.username, email: i.email, password: i.password, pais: i.country, ciudad: i.city, acepto_terminos: i.acceptedTerms,
});

const EVENT_TYPES: readonly QueueEventType[] = ['turno_creado', 'turno_llamado', 'turno_pospuesto', 'turno_cancelado', 'turno_no_show', 'cola_actualizada'];

/** Evento de `/ws/turnos/{cola}`. `null` para pings y mensajes de control. */
export function queueEventFromJson(j: J): QueueEvent | null {
  const type = j.tipo as string | undefined;
  if (!type || type === 'ping' || type === 'conectado') return null;
  const payload = j.payload as J | undefined;
  let ticket: Ticket | null = null;
  if (payload && isTicketStatusLike(payload)) {
    try {
      const nowIso = new Date().toISOString();
      ticket = ticketFromJson({ cola_id: j.cola_id, propietario_nombre: '', usuario_id: '', franja_inicio: nowIso, hora_creacion: nowIso, ...payload });
    } catch { ticket = null; }
  }
  return { type: (EVENT_TYPES as readonly string[]).includes(type) ? (type as QueueEventType) : 'desconocido', queueId: s(j.cola_id ?? ''), ticket };
}

/** Aviso de `/ws/notificaciones`: `{"tipo":"notificacion","notificacion":{…}}`. */
export function notificationEventFromJson(j: J): AppNotification | null {
  if (j.tipo !== 'notificacion' || !j.notificacion || typeof j.notificacion !== 'object') return null;
  return notificationFromJson({ usuario_id: '', ...(j.notificacion as J) });
}
