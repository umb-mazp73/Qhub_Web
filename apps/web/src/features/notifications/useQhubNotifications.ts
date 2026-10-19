import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@qhub/core';
import type { AppNotification } from '@qhub/api-client';
import { useContainer, useSession } from '@/app/container';
import { useToast } from '@/shared/ui';
import { mapKindToText } from './qhub-notifications';

/**
 * Avisos personales de la API Qhub (`WS /ws/notificaciones`). Solo escucha mientras hay conexión con Qhub.
 * Cada aviso nuevo refresca la lista histórica (REST) y muestra un toast. Errores irrecuperables (cierre 4401):
 * se deja de escuchar, sin mostrar detalle técnico (a consola).
 */
export function useQhubNotifications() {
  const { notifications, realtime } = useContainer();
  const { connection } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const connected = connection.status === 'connected';

  // Histórico por REST (solo cuando hay conexión). Si falla, la superficie queda silenciosa.
  useQuery({ queryKey: ['qhub-notifications'], enabled: connected, queryFn: async () => unwrap(await notifications.list({ limit: 50 })) });

  useEffect(() => {
    if (!connected) return;
    const stop = realtime.subscribeNotifications({
      onNotification: (n: AppNotification) => {
        void qc.invalidateQueries({ queryKey: ['qhub-notifications'] });
        toast.show(n.message, { title: mapKindToText(n.kind) });
      },
      onError: (e) => { console.error('Aviso personal de Qhub: suscripción cerrada', e); },
    });
    return stop;
  }, [connected, realtime, qc, toast]);
}
