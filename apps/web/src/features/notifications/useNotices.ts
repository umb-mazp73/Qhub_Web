import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '@qhub/core';
import { useContainer, useSession } from '@/app/container';
import type { StaffNotice } from './notifications';
import { useRefreshInterval } from '@/features/preferences/hooks';

/** Avisos del equipo de la organización activa. En tiempo real (Supabase Realtime) con el sondeo como respaldo. */
export function useNotices(opts: { limit?: number; enabled?: boolean } = {}) {
  const { staffNotices, staffNoticesRealtime } = useContainer();
  const { session } = useSession();
  const orgId = session.membership?.organization.id;
  const enabled = !!orgId && (opts.enabled ?? true);
  const qc = useQueryClient();
  const poll = useRefreshInterval();
  const [rtConnected, setRtConnected] = useState(false);
  // Con el tiempo real conectado se apaga el sondeo; si cae, vuelve la preferencia.
  const refetchInterval = rtConnected ? false : poll;

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['notices', orgId] }), qc.invalidateQueries({ queryKey: ['notices-count', orgId] })]);

  useEffect(() => {
    if (!enabled || !orgId) return;
    const stop = staffNoticesRealtime.subscribe(orgId, {
      onChange: () => { void refresh(); },
      onStatus: (s) => setRtConnected(s === 'connected'),
    });
    return () => { setRtConnected(false); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, orgId, staffNoticesRealtime]);

  const list = useQuery({ queryKey: ['notices', orgId, opts.limit ?? 100], enabled, refetchInterval, queryFn: async () => unwrap(await staffNotices.list(orgId!, { limit: opts.limit ?? 100 })) });
  const count = useQuery({ queryKey: ['notices-count', orgId], enabled, refetchInterval, queryFn: async () => unwrap(await staffNotices.unreadCount(orgId!)) });
  return {
    orgId, list, unread: count.data ?? 0, refresh,
    markRead: async (n: StaffNotice) => { const r = await staffNotices.markRead(n.id); await refresh(); return r; },
    markAll: async () => { const r = await staffNotices.markAllRead(orgId!); await refresh(); return r; },
    remove: async (n: StaffNotice) => { const r = await staffNotices.remove(n.id); await refresh(); return r; },
    removeRead: async () => { const r = await staffNotices.removeRead(orgId!); await refresh(); return r; },
  };
}
