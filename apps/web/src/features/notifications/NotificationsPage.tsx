import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/app/container';
import { routeAllowed } from '@/features/staff';
import { Button, EmptyState, Notice, PageHead, Panel, Select, Skeleton, Tabs, useToast } from '@/shared/ui';
import { AutoRefresh } from '@/features/shell/AutoRefresh';
import { enableSystemNotices, setSystemNotices, systemNoticesDenied, systemNoticesOn, systemNoticesSupported } from './popups';
import { groupByDay, NOTICE_KIND_LABEL, type NoticeKind, type StaffNotice } from './notifications';
import { NoticeRow } from './NoticeRow';
import { useNotices } from './useNotices';
import { friendlyError } from '@qhub/core';

const KINDS: ReadonlyArray<{ value: NoticeKind | ''; label: string }> = [{ value: '', label: 'Todos los tipos' }, ...(Object.keys(NOTICE_KIND_LABEL) as NoticeKind[]).map((k) => ({ value: k, label: NOTICE_KIND_LABEL[k] }))];

export function NotificationsPage() {
  const nav = useNavigate();
  const role = useSession().session.membership?.role;
  const toast = useToast();
  const n = useNotices();
  const [tab, setTab] = useState(0);
  const [kind, setKind] = useState<NoticeKind | ''>('');

  const all = n.list.data ?? [];
  const shown = all.filter((x) => (tab === 0 || !x.read) && (!kind || x.kind === kind));
  const unread = all.filter((x) => !x.read).length;
  const open = (x: StaffNotice) => { if (!x.read) void n.markRead(x); if (x.route && routeAllowed(role, x.route)) nav(x.route); };     // un aviso nunca lleva a una pantalla que el rol no puede ver
  const fail = (r: { ok: boolean; failure?: { message: string } }) => { if (!r.ok) toast.show(r.failure?.message ?? 'No pudimos completar la acción.', { error: true }); };

  return (
    <div>
      <PageHead title="Avisos" breadcrumb="Cuenta" actions={<AutoRefresh keys={[['notices'], ['notices-count']]} />} />
      <SystemNoticesSetting />
      <div className="flex flex-col gap-4">
        <Notice kind="info" title="Aquí llegan los avisos de tu organización." message="Quién se une al equipo, quién se vincula a tu organización y los clientes nuevos de la app móvil. Se actualizan solos según tu preferencia." />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="overflow-x-auto"><Tabs labels={[`Todos (${all.length})`, `Sin leer (${unread})`]} index={tab} onChange={setTab} /></div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-[200px]"><Select<NoticeKind | ''> label="Tipo" hideLabel value={kind} options={KINDS} onValueChange={setKind} /></div>
            <Button kind="tertiary" icon="check" disabled={unread === 0} onClick={async () => fail(await n.markAll())}>Marcar todo como leído</Button>
            <Button kind="ghost" icon="trash" disabled={!all.some((x) => x.read)} onClick={async () => { fail(await n.removeRead()); toast.show('Borraste los avisos leídos.'); }}>Borrar leídos</Button>
          </div>
        </div>
        {n.list.isLoading ? <Skeleton height={160} /> : n.list.isError ? (
          <EmptyState title="No pudimos cargar los avisos" message={friendlyError(n.list.error)} action={<Button kind="tertiary" onClick={() => void n.list.refetch()}>Reintentar</Button>} />
        ) : shown.length === 0 ? (
          <EmptyState title={tab === 1 ? 'No tienes avisos sin leer' : 'Aún no hay avisos'} message="Cuando alguien se una al equipo o a tu organización, lo verás aquí." />
        ) : groupByDay(shown).map((g) => (
          <Panel key={g.label} title={g.label}>
            <ul className="m-0 list-none p-0">{g.items.map((x) => <NoticeRow key={x.id} notice={x} onOpen={open} onRead={async (v) => fail(await n.markRead(v))} onRemove={async (v) => fail(await n.remove(v))} />)}</ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}

/** Avisos del navegador: llegan aunque estés en otra pestaña o ventana. Hay que permitirlos una vez. */
function SystemNoticesSetting() {
  const toast = useToast();
  const [, rerender] = useState(0);
  if (!systemNoticesSupported()) return null;
  const on = systemNoticesOn();
  async function turnOn() {
    const granted = await enableSystemNotices();
    rerender((n) => n + 1);
    toast.show(granted ? 'Listo: te avisaremos aunque estés en otra pestaña.' : 'El navegador bloqueó los avisos. Permítelos desde el candado de la barra de direcciones.', { error: !granted });
  }
  return (
    <div className="mb-4"><Notice kind={on ? 'success' : 'info'} title={on ? 'Los avisos del navegador están activados.' : 'Recibe avisos aunque estés en otra pestaña.'}
      message={on ? 'Cuando llegue un aviso y no estés mirando esta pestaña, te saldrá una notificación del navegador.' : systemNoticesDenied() ? 'Tu navegador los tiene bloqueados. Permítelos desde el candado de la barra de direcciones.' : 'Activa las notificaciones del navegador para enterarte de inmediato.'}
      action={on ? <Button kind="tertiary" size="sm" onClick={() => { setSystemNotices(false); rerender((n) => n + 1); }}>Desactivar</Button> : systemNoticesDenied() ? undefined : <Button size="sm" onClick={() => void turnOn()}>Activar avisos</Button>} /></div>
  );
}
