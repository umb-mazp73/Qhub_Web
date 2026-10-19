import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@qhub/core';
import { useToast } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { routeAllowed } from '@/features/staff';
import { freshNotices, systemNoticesOn } from './popups';

const POLL_MS = 10_000;

/**
 * Avisos emergentes: cuando llega un aviso nuevo aparece como notificación flotante en la pantalla y, si la pestaña está en segundo plano
 * y la persona lo permitió, como notificación del navegador. Los avisos que ya existían al abrir no se muestran (están en la campana).
 */
export function NoticePopups() {
  const { staffNotices, staffNoticesRealtime } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const orgId = session.membership?.organization.id;
  const role = session.membership?.role;
  const userId = session.user?.id;
  const seen = useRef<Set<string> | null>(null);          // null = aún no hay línea base
  const q = useQuery({ queryKey: ['notice-popups', orgId, userId], enabled: !!orgId, refetchInterval: POLL_MS, queryFn: async () => unwrap(await staffNotices.list(orgId!, { unreadOnly: true, limit: 20 })) });

  useEffect(() => { seen.current = null; }, [orgId, userId]);          // otra organización u otra cuenta: nueva línea base
  // Tiempo real: refresca al instante; el sondeo de 10 s queda como respaldo.
  useEffect(() => {
    if (!orgId) return;
    return staffNoticesRealtime.subscribe(orgId, { onChange: () => { void qc.invalidateQueries({ queryKey: ['notice-popups', orgId, userId] }); }, onStatus: () => {} });
  }, [orgId, userId, staffNoticesRealtime, qc]);
  useEffect(() => {
    if (!q.data) return;
    if (seen.current === null) { seen.current = new Set(q.data.map((n) => n.id)); return; }
    const fresh = freshNotices(q.data, seen.current);
    fresh.forEach((n) => seen.current!.add(n.id));
    const go = (route: string | null) => nav(route && routeAllowed(role, route) ? route : '/notificaciones');
    fresh.slice(-3).forEach((n) => {
      toast.show(n.message, { title: n.title, action: { label: 'Ver', onClick: () => go(n.route) } });
      if (document.hidden && systemNoticesOn()) {
        try {
          const sys = new Notification(n.title, { body: n.message, tag: n.id, icon: '/favicon.svg' });
          sys.onclick = () => { window.focus(); go(n.route); sys.close(); };
        } catch { /* el navegador no lo permite */ }
      }
    });
    if (fresh.length > 3) toast.show(`Tienes ${fresh.length - 3} avisos más en la campana.`);
  }, [q.data, nav, role, toast]);
  return null;
}
