import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { unwrap, defaultQueuePrefix, friendlyError } from '@qhub/core';
import type { Queue } from '@qhub/api-client';
import { Button, EmptyState, IconButton, Kpi, Kpis, Notice, PageHead, QueueTile, Skeleton, Tabs } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { AutoRefresh } from '@/features/shell/AutoRefresh';
import { can } from '@/features/staff/permissions';
import { useRefreshInterval } from '@/features/preferences/hooks';
import { usePrefixes, useQueueLimit, useQueues } from '@/features/queues/hooks';

export function QueuesPage() {
  const nav = useNavigate();
  const { session } = useSession();
  const isAdmin = can(session.membership?.role, 'queues.manage');
  const queues = useQueues();
  const limit = useQueueLimit();
  const prefixes = usePrefixes().data ?? {};
  const [tab, setTab] = useState(0);

  const all = queues.data ?? [];
  const active = all.filter((q) => q.active);
  const archived = all.filter((q) => !q.active);
  const shown = [all, active, archived][tab] ?? all;
  const l = limit.data;
  const canCreate = isAdmin && (l?.available ?? 0) > 0;

  return (
    <div>
      <PageHead title="Colas" breadcrumb={session.membership?.organization.name} actions={<>
        <AutoRefresh keys={[['queues'], ['queue-limit'], ['queue-state']]} />
        {isAdmin && <Button icon="plus" disabled={!canCreate} onClick={() => nav('/colas/nueva')}>Crear cola</Button>}
      </>} />
      {queues.isLoading ? <Skeleton height={160} /> : queues.isError ? (
        <EmptyState title="No pudimos cargar esto" message={friendlyError(queues.error)} action={<Button kind="tertiary" onClick={() => void queues.refetch()}>Reintentar</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <Kpis>
            <Kpi label="Colas activas" value={String(active.length)} hint={l ? `de ${l.limit} permitidas` : undefined} />
            <Kpi label="Cupos de cola libres" value={l ? String(l.available) : '—'} hint={l?.available === 0 ? 'Archiva una cola para liberar un lugar' : undefined} />
          </Kpis>
          {l && l.available === 0 && isAdmin && <Notice kind="warning" title={`Llegaste al límite de colas (${l.limit}).`} message="Archiva una cola que ya no uses para crear otra." />}
          <Tabs labels={[`Todas (${all.length})`, `Activas (${active.length})`, `Archivadas (${archived.length})`]} index={tab} onChange={setTab} />
          {shown.length === 0 ? (
            <EmptyState title={all.length === 0 ? 'Crea tu primera cola' : 'No hay colas en esta vista'} message={all.length === 0 ? 'Define su horario y empieza a recibir turnos.' : undefined}
              action={all.length === 0 && isAdmin ? <Button icon="plus" onClick={() => nav('/colas/nueva')}>Crear cola</Button> : undefined} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
              {shown.map((q) => <QueueCard key={q.id} queue={q} prefix={prefixes[q.id] ?? defaultQueuePrefix(q.name)} isAdmin={isAdmin} onOpen={() => nav(`/en-vivo?cola=${q.id}`)} onEdit={() => nav(`/colas/${q.id}`)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueueCard({ queue, prefix, isAdmin, onOpen, onEdit }: { queue: Queue; prefix: string; isAdmin: boolean; onOpen: () => void; onEdit: () => void }) {
  const { queues } = useContainer();
  const refetchInterval = useRefreshInterval();
  const state = useQuery({ queryKey: ['queue-state', queue.id], enabled: queue.active, refetchInterval, queryFn: async () => unwrap(await queues.state(queue.id)) });
  return (
    <div className="relative">
      <QueueTile name={queue.name} subtitle={queue.active ? (queue.description ?? `Prefijo ${prefix}`) : 'Archivada'} waiting={state.data?.waiting ?? 0} serving={state.data?.serving ?? 0} prefix={prefix} closed={!queue.active} onClick={onOpen} />
      {isAdmin && <div className="absolute bottom-2 right-2"><IconButton icon="edit" label={`Editar ${queue.name}`} onClick={onEdit} /></div>}
    </div>
  );
}
