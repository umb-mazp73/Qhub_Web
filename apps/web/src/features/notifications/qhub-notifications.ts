import type { AppNotification } from '@qhub/api-client';

/** Aviso personal de la API Qhub (lo que entrega `WS /ws/notificaciones`). Modelo de presentación. */
export type QhubNotification = AppNotification;

/** Etiqueta en español por `tipo_aviso` para el título del toast. */
export function mapKindToText(kind: string | null): string {
  switch (kind) {
    case 'turno_llamado': return 'Es tu turno';
    case 'turno_pospuesto': return 'Turno pospuesto';
    case 'turno_no_show': return 'No llegaste a tiempo';
    case 'recordatorio': return 'Recordatorio';
    default: return 'Aviso';
  }
}
