import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { defaultQueuePrefix, formatHm, formatTurnNumber, type Result, friendlyError } from '@qhub/core';
import type { Ticket } from '@qhub/api-client';
import { Button, ConfirmDialog, EmptyState, Kpi, LiveIndicator, Notice, PageHead, Panel, Skeleton, Table, Td, TurnBadge, TurnNumber, useToast } from '@/shared/ui';
import { useSession } from '@/app/container';
import { can } from '@/features/staff/permissions';
import { useLiveBoard } from './useLiveBoard';
import { usePrefixes, useQueues } from '@/features/queues/hooks';

export function LivePage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const queues = useQueues();
  if (queues.isLoading) return <Skeleton height={200} />;
  if (queues.isError) return <EmptyState title="No pudimos cargar esto" message={friendlyError(queues.error)} action={<Button kind="tertiary" onClick={() => void queues.refetch()}>Reintentar</Button>} />;
  const active = (queues.data ?? []).filter((q) => q.active);
  if (active.length === 0) return <EmptyState title="No hay colas activas" message="Crea una cola para ver su fila en vivo." />;
  const selected = active.find((q) => q.id === params.get('cola')) ?? active[0]!;
  return (
    <div>
      <PageHead title="En vivo" breadcrumb="Operación" />
      <div className="mb-6 flex items-center gap-2 overflow-x-auto">
        {active.map((q) => <Button key={q.id} size="sm" kind={q.id === selected.id ? 'primary' : 'secondary'} onClick={() => nav(`/en-vivo?cola=${q.id}`)}>{q.name}</Button>)}
      </div>
      <LiveBoard key={selected.id} queueId={selected.id} queueName={selected.name} />
    </div>
  );
}

export function LiveBoard({ queueId, queueName }: { queueId: string; queueName: string }) {
  const board = useLiveBoard(queueId);
  const toast = useToast();
  const { session } = useSession();
  const canOperate = can(session.membership?.role, 'live.operate');
  const prefix = usePrefixes().data?.[queueId] ?? defaultQueuePrefix(queueName);
  const [confirmNoShow, setConfirmNoShow] = useState<Ticket | null>(null);

  const report = (r: Result<Ticket> | null, okMsg: string) => { if (r) (r.ok ? toast.show(okMsg) : toast.show(r.failure.message, { error: true })); };

  if (board.loading && board.tickets.length === 0) return <Skeleton height={220} />;
  if (board.error && board.tickets.length === 0) return <EmptyState title="No pudimos cargar esto" message={friendlyError(board.error)} action={<Button kind="tertiary" onClick={() => void board.reload()}>Reintentar</Button>} />;

  const label = (t: Ticket) => formatTurnNumber(t.number, prefix);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4 bg-brand-ink p-6 text-white">
          <div className="flex items-center justify-between gap-2"><h2 className="t-h3">{queueName}</h2><LiveIndicator live={board.isLive} onInk /></div>
          <div>
            <div className="t-caption text-sidebar-text">Atendiendo ahora</div>
            {board.serving.length === 0 ? <div className="t-turn-xl text-sidebar-text">—</div> : board.serving.map((t) => (
              <div key={t.id} className="mb-2 flex items-center gap-2">
                <TurnNumber number={t.number} prefix={prefix} xl={board.serving.length === 1} className="text-white" />
                {canOperate && <><Button kind="accent" icon="check" loading={board.busyId === t.id} disabled={board.busyId !== null} onClick={async () => report(await board.act('finish', t), `Turno ${label(t)} finalizado.`)}>Finalizar</Button>
                <Button kind="danger" icon="noshow" disabled={board.busyId !== null} onClick={() => setConfirmNoShow(t)}>No-show</Button></>}
              </div>
            ))}
          </div>
          <div>
            {canOperate ? <Button size="lg" icon="call" disabled={!board.next || board.busyId !== null} loading={board.busyId !== null && board.busyId === board.next?.id}
              onClick={async () => report(await board.callNext(), `Llamaste a ${board.next ? label(board.next) : ''}.`)}>
              {board.next ? `Llamar siguiente · ${label(board.next)}` : 'No hay turnos en espera'}
            </Button> : <p className="text-sidebar-text">Tu rol puede ver la fila, pero no atenderla.</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-px bg-border-subtle">
          <Kpi label="En espera" value={String(board.waiting.length)} />
          <Kpi label="Atendiendo" value={String(board.serving.length)} />
          <Kpi label="Atendidos hoy" value={String(board.tickets.filter((t) => t.status === 'finalizado').length)} />
        </div>
      </div>
      {board.error && <Notice kind="warning" title={friendlyError(board.error)} />}
      <Panel title={`Fila (${board.waiting.length})`} flush>
        {board.waiting.length === 0 ? <EmptyState title="Nadie en espera" message="Los turnos nuevos aparecerán aquí al instante." /> : (
          <div className="overflow-x-auto"><Table label="Fila de espera">
            <tbody>
              {board.waiting.map((t) => (
                <tr key={t.id}>
                  <Td className="w-[110px]"><TurnNumber number={t.number} prefix={prefix} /></Td>
                  <Td className="w-[90px] font-mono">{formatHm(t.slotStart)}</Td>
                  <Td className="text-text-secondary">{t.scheduled ? 'Reservado' : 'Turno inmediato'}</Td>
                  <Td className="font-mono t-caption text-text-secondary">{t.userId}</Td>
                  <Td><TurnBadge status="en_espera" /></Td>
                  <Td num>{canOperate && <Button size="sm" kind="tertiary" disabled={board.busyId !== null} onClick={async () => report(await board.act('call', t), `Llamaste a ${label(t)}.`)}>Llamar</Button>}</Td>
                </tr>
              ))}
            </tbody>
          </Table></div>
        )}
      </Panel>
      {confirmNoShow && (
        <ConfirmDialog title="Marcar no-show" message={`El turno ${label(confirmNoShow)} se marcará como no presentado. Esta acción no se puede deshacer.`} confirmLabel="Marcar no-show"
          onCancel={() => setConfirmNoShow(null)}
          onConfirm={async () => { const t = confirmNoShow; setConfirmNoShow(null); report(await board.act('noShow', t), 'Marcado como no-show.'); }} />
      )}
    </div>
  );
}
