import { useCallback, useEffect, useRef, useState } from 'react';
import type { Failure, Result } from '@qhub/core';
import { applyQueueEvent, nextAppointment, nextToCall, sortWaitingRoom, type ConnectionStatus, type Ticket } from '@qhub/api-client';
import { useContainer } from '@/app/container';

export interface LiveBoard {
  tickets: Ticket[]; loading: boolean; error: Failure | null; connection: ConnectionStatus; busyId: string | null;
  serving: Ticket[]; waiting: Ticket[]; next: Ticket | null; /** Próxima cita que aún no llega (si no hay a quién llamar ya). */ upcoming: Ticket | null; now: Date; isLive: boolean;
  reload(): Promise<void>;
  act(kind: 'call' | 'finish' | 'noShow', t: Ticket): Promise<Result<Ticket>>;
  callNext(): Promise<Result<Ticket> | null>;
  /** Termina el turno en atención y llama al siguiente en un solo paso. */
  finishAndCallNext(t: Ticket): Promise<{ finished: Result<Ticket>; called: Result<Ticket> | null }>;
}

/** Fila de una cola en vivo: carga el día, escucha el WebSocket y ejecuta las acciones del operador. */
export function useLiveBoard(queueId: string): LiveBoard {
  const { tickets: repo, realtime } = useContainer();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Failure | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>('connecting');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const alive = useRef(true);
  const latest = useRef<Ticket[]>([]);
  latest.current = tickets;

  const reload = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    const all: Ticket[] = [];
    for (let offset = 0; ; offset += 500) {
      const r = await repo.list({ queueId, date: new Date(), limit: 500, offset });
      if (!alive.current) return;
      if (!r.ok) { setLoading(false); setError(r.failure); return; }
      all.push(...r.value);
      if (r.value.length < 500) break;
    }
    setTickets(all); setLoading(false); setError(null);
  }, [repo, queueId]);

  useEffect(() => {
    alive.current = true;
    void reload();
    const off = realtime.subscribeQueue(queueId, {
      onEvent: (e) => {
        if (e.queueId && e.queueId !== queueId) return;
        if (!e.ticket) void reload(true); // cola_actualizada (finalizar / no-show manual): la fila cambió
        else setTickets((cur) => applyQueueEvent(cur, e));
      },
      onError: (e) => setError(e as Failure),
      onStatus: setConnection,
    });
    const timer = setInterval(() => void reload(true), 60_000);
    const clock = setInterval(() => setNow(new Date()), 20_000);   // las citas «llegan» y los cronómetros avanzan con el reloj
    return () => { alive.current = false; off(); clearInterval(timer); clearInterval(clock); };
  }, [realtime, queueId, reload]);

  const act = useCallback(async (kind: 'call' | 'finish' | 'noShow', t: Ticket) => {
    setBusyId(t.id);
    const r = await repo[kind](t.id);
    if (r.ok) setTickets((cur) => applyQueueEvent(cur, { type: 'cola_actualizada', queueId, ticket: r.value }));
    setBusyId(null);
    return r;
  }, [repo, queueId]);

  const queue = sortWaitingRoom(tickets, now);
  const next = nextToCall(tickets, now);
  const finishAndCallNext = async (t: Ticket) => {
    const finished = await act('finish', t);
    if (!finished.ok) return { finished, called: null };
    const following = nextToCall(latest.current, new Date());
    return { finished, called: following ? await act('call', following) : null };
  };
  return {
    tickets, loading, error, connection, busyId,
    serving: queue.filter((t) => t.status === 'atendiendo'), waiting: queue.filter((t) => t.status === 'en_espera'), next, upcoming: next ? null : nextAppointment(tickets, now), now, isLive: connection === 'connected',
    reload: () => reload(), act,
    callNext: async () => (next ? act('call', next) : null),
    finishAndCallNext,
  };
}
