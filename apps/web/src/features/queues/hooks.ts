import { useQuery } from '@tanstack/react-query';
import { unwrap } from '@qhub/core';
import { useContainer, useSession } from '@/app/container';
import { useRefreshInterval } from '@/features/preferences/hooks';

/** Prefijos de turno (`A`, `E`…) de la organización activa, guardados en Supabase. */
export function usePrefixes() {
  const { staff } = useContainer();
  const { session } = useSession();
  const orgId = session.membership?.organization.id;
  return useQuery({ queryKey: ['prefixes', orgId], enabled: !!orgId, queryFn: async () => unwrap(await staff.queuePrefixes(orgId!)) });
}

export function useQueues() {
  const { queues } = useContainer();
  const refetchInterval = useRefreshInterval();
  return useQuery({ queryKey: ['queues'], refetchInterval, queryFn: async () => unwrap(await queues.list()) });
}

export function useQueueLimit() {
  const { queues } = useContainer();
  return useQuery({ queryKey: ['queue-limit'], queryFn: async () => unwrap(await queues.limit()) });
}
