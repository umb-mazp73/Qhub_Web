import type { HttpRequest, HttpResponse, HttpTransport } from '../src';

/** Transporte en memoria: responde según `METHOD /path`. */
export class FakeTransport implements HttpTransport {
  routes = new Map<string, HttpResponse>();
  requests: HttpRequest[] = [];
  on(route: string, body: unknown, status = 200) { this.routes.set(route, { status, body }); return this; }
  async send(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    return this.routes.get(`${req.method} ${req.path}`) ?? { status: 404, body: { detail: 'sin ruta' } };
  }
  get last() { return this.requests[this.requests.length - 1]!; }
}

export const ticketJson = (o: Record<string, unknown> = {}) => ({
  id: 't1', cola_id: 'q1', propietario_tipo: 'empresa', propietario_id: 'o1', propietario_nombre: 'Clínica Norte', usuario_id: 'cli-1',
  franja_inicio: '2026-10-20T15:00:00Z', franja_fecha: '2026-10-20', programado: false, numero: 5, estado: 'en_espera', posicion: 1,
  hora_creacion: '2026-10-20T14:00:00Z', hora_atencion: null, hora_finalizacion: null, agente_id: null, ...o,
});
export const queueJson = (o: Record<string, unknown> = {}) => ({
  id: 'q1', propietario_tipo: 'empresa', propietario_id: 'o1', propietario_nombre: 'Clínica Norte', nombre: 'Caja 1', descripcion: null, activa: true,
  rabbitmq_queue_name: 'qhub.empresa.clinica-norte.caja-1', ...o,
});
export const scheduleJson = () => ({
  cola_id: 'q1', zona_horaria: 'America/Guayaquil', hora_apertura: '08:00:00', hora_cierre: '18:00:00', duracion_franja_minutos: 30,
  dias_atencion: [1, 2, 3, 4, 5], duracion_turno_minutos: 10, puestos: 2, capacidad_diaria: 0, dias_anticipacion_maxima: 7,
  franjas_por_dia: 20, cupos_por_franja: 6, turnos_por_dia: 120,
});
