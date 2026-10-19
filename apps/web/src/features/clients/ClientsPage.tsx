import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPercent, unwrap, friendlyError, validatePersonName, isValidPhone } from '@qhub/core';
import { parseTicketStatus } from '@qhub/api-client';
import { Avatar, Button, ConfirmDialog, Dialog, EmptyState, Icon, IconButton, Kpi, Kpis, Notice, PageHead, Panel, Select, Skeleton, Table, Td, TextField, Th, TurnBadge, useToast } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { AutoRefresh } from '@/features/shell/AutoRefresh';
import { can } from '@/features/staff/permissions';
import { canRequestEdit, CLIENT_FILTERS, clientInitials, clientName, clientsToCsv, clientStats, filterClients, noShowRate, type Client, type ClientFilter, type EditPermission } from './clients';
import { useRefreshInterval } from '@/features/preferences/hooks';
import { datedFilename, downloadText } from '@/shared/download';

const PAGE = 25;
type Sort = 'recientes' | 'turnos' | 'no_show' | 'nombre';
const SORTS: ReadonlyArray<{ value: Sort; label: string }> = [{ value: 'recientes', label: 'Más recientes' }, { value: 'turnos', label: 'Más turnos' }, { value: 'no_show', label: 'Más no-show' }, { value: 'nombre', label: 'Nombre (A–Z)' }];
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : '—');
const sorters: Record<Sort, (a: Client, b: Client) => number> = {
  recientes: (a, b) => (b.lastTicket?.getTime() ?? b.firstSeen?.getTime() ?? 0) - (a.lastTicket?.getTime() ?? a.firstSeen?.getTime() ?? 0),
  turnos: (a, b) => b.tickets - a.tickets,
  no_show: (a, b) => b.noShow - a.noShow || b.tickets - a.tickets,
  nombre: (a, b) => clientName(a).localeCompare(clientName(b), 'es'),
};

/** Personas que usan la organización desde la app móvil. Admin: contacto y bloqueo. Supervisor: solo nombre y actividad. */
export function ClientsPage() {
  const { clients } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const role = session.membership!.role;
  const orgId = session.membership!.organization.id;
  const manage = can(role, 'clients.manage');
  const refetchInterval = useRefreshInterval();
  const list = useQuery({ queryKey: ['clients', orgId], refetchInterval, queryFn: async () => unwrap(await clients.list(orgId)) });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('todos');
  const [sort, setSort] = useState<Sort>('recientes');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Client | null>(null);

  const all = list.data ?? [];
  const stats = useMemo(() => clientStats(all), [all]);
  const rows = useMemo(() => filterClients(all, { query, filter }).sort(sorters[sort]), [all, query, filter, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const reload = () => qc.invalidateQueries({ queryKey: ['clients', orgId] });

  return (
    <div>
      <PageHead title="Clientes" breadcrumb="Organización" actions={<>
        <AutoRefresh keys={[['clients']]} />
        <Button icon="arrow-right" disabled={rows.length === 0} onClick={() => { downloadText(datedFilename('clientes'), clientsToCsv(rows)); toast.show(`Exportamos ${rows.length} clientes.`); }}>Exportar CSV</Button>
      </>} />
      <div className="flex flex-col gap-4">
        {!manage && <Notice kind="info" title="Tu rol ve el nombre y la actividad de los clientes." message="El correo, el teléfono y el bloqueo los gestiona un administrador." />}
        {list.isLoading ? <Skeleton height={96} /> : list.isError ? (
          <EmptyState title="No pudimos cargar los clientes" message={friendlyError(list.error)} action={<Button kind="tertiary" onClick={() => void list.refetch()}>Reintentar</Button>} />
        ) : (
          <>
            <Kpis>
              <Kpi label="Clientes" value={String(stats.total)} hint="vinculados a tu organización o que han sacado turno" />
              <Kpi label="Activos en 30 días" value={String(stats.active30)} />
              <Kpi label="Nuevos en 7 días" value={String(stats.new7)} />
              <Kpi label="Vinculados a tu organización" value={String(stats.follow)} />
              <Kpi label="Bloqueados" value={String(stats.blocked)} />
            </Kpis>
            <div className="grid grid-cols-1 items-end gap-2 border border-border-subtle bg-layer-01 p-4 sm:grid-cols-[1fr_220px_180px]">
              <TextField label="Buscar por nombre, correo o teléfono" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
              <Select<ClientFilter> label="Mostrar" value={filter} options={CLIENT_FILTERS} onValueChange={(v) => { setFilter(v); setPage(0); }} />
              <Select<Sort> label="Ordenar por" value={sort} options={SORTS} onValueChange={setSort} />
            </div>
            <div className="border border-border-subtle bg-layer-01">
              {rows.length === 0 ? (
                <EmptyState title={all.length === 0 ? 'Aún no hay clientes' : 'Sin resultados'} message={all.length === 0 ? 'Cuando alguien saque un turno o guarde tu organización desde la app móvil, aparecerá aquí. Publica tu organización en Ajustes si aún no lo hiciste.' : 'Prueba con otra búsqueda o filtro.'} />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table label="Clientes">
                      <thead><tr><Th>Cliente</Th><Th num>Turnos</Th><Th num>Atendidos</Th><Th num>No-show</Th><Th>Último turno</Th><Th>Estado</Th><Th /></tr></thead>
                      <tbody>
                        {shown.map((c) => (
                          <tr key={c.userId} className="hover:bg-layer-hover">
                            <Td><button type="button" onClick={() => setSelected(c)} className="flex cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit">
                              <Avatar size="sm" text={clientInitials(c)} /><span><span className="block">{clientName(c)}</span>{c.email && <span className="t-caption text-text-secondary">{c.email}</span>}</span></button></Td>
                            <Td num className="font-mono">{c.tickets}</Td><Td num className="font-mono">{c.served}</Td>
                            <Td num className="font-mono">{c.noShow}{c.noShow > 0 && <span className="t-caption text-text-secondary"> · {formatPercent(noShowRate(c))}</span>}</Td>
                            <Td>{fmtDate(c.lastTicket)}</Td>
                            <Td>{c.blocked ? <span className="inline-flex items-center gap-1 text-support-error"><Icon name="error" />Bloqueado</span> : c.follows ? <span className="inline-flex items-center gap-1 text-state-done-text"><Icon name="check" />Vinculado</span> : <span className="text-text-secondary">—</span>}</Td>
                            <Td num><Button size="sm" kind="tertiary" onClick={() => setSelected(c)}>Ver</Button></Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  <div className="flex min-h-row flex-wrap items-center gap-2 border-t border-border-subtle px-4 py-2">
                    <span className="t-caption flex-1 text-text-secondary">{cur * PAGE + 1}–{cur * PAGE + shown.length} de {rows.length} clientes</span>
                    <span className="t-caption text-text-secondary">Página {cur + 1} de {pages}</span>
                    <IconButton icon="chevron-left" label="Anterior" disabled={cur === 0} onClick={() => setPage(cur - 1)} />
                    <IconButton icon="chevron-right" label="Siguiente" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
      {selected && <ClientDialog client={all.find((c) => c.userId === selected.userId) ?? selected} orgId={orgId} manage={manage} onClose={() => setSelected(null)} onChanged={() => void reload()} />}
    </div>
  );
}

function ClientDialog({ client: c, orgId, manage, onClose, onChanged }: { client: Client; orgId: string; manage: boolean; onClose: () => void; onChanged: () => void }) {
  const { clients } = useContainer();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const permission = useQuery({ queryKey: ['client-permission', orgId, c.userId], enabled: manage, queryFn: async () => unwrap(await clients.editPermission(orgId, c.userId)) });
  const history = useQuery({ queryKey: ['client-history', orgId, c.userId], queryFn: async () => unwrap(await clients.history(orgId, c.userId, 20)) });
  const info = useQuery({ queryKey: ['client-block', orgId, c.userId, c.blocked], enabled: c.blocked, queryFn: async () => unwrap(await clients.blockInfo(orgId, c.userId)) });

  async function toggle() {
    setBusy(true);
    const r = c.blocked ? await clients.unblock(orgId, c.userId) : await clients.block(orgId, c.userId, reason);
    setBusy(false);
    if (r.ok) { toast.show(c.blocked ? 'Cliente desbloqueado.' : 'Cliente bloqueado: ya no podrá sacar turnos.'); setReason(''); onChanged(); } else toast.show(r.failure.message, { error: true });
  }

  async function remove() {
    setConfirmRemove(false); setBusy(true);
    const r = await clients.remove(orgId, c.userId);
    setBusy(false);
    if (r.ok) { toast.show('Eliminamos al cliente de tu lista.'); onChanged(); onClose(); } else toast.show(r.failure.message, { error: true });
  }

  return (
    <Dialog wide title={clientName(c)} onClose={onClose} actions={<Button kind="ghost" onClick={onClose}>Cerrar</Button>}>
      <div className="flex items-center gap-4">
        <Avatar size="lg" text={clientInitials(c)} />
        <div className="min-w-0 text-text-secondary">
          {c.email && <div className="truncate">{c.email}</div>}{c.phone && <div>{c.phone}</div>}
          <div>Cliente desde {fmtDate(c.firstSeen)} · {c.follows ? 'vinculado a tu organización' : 'ya no está vinculado'}</div>
        </div>
      </div>
      <Kpis>
        <Kpi label="Turnos" value={String(c.tickets)} /><Kpi label="Atendidos" value={String(c.served)} />
        <Kpi label="No-show" value={String(c.noShow)} hint={formatPercent(noShowRate(c))} /><Kpi label="Cancelados" value={String(c.cancelled)} />
      </Kpis>
      <h3 className="t-h4">Últimos turnos</h3>
      {history.isLoading ? <Skeleton height={80} /> : history.isError ? <Notice kind="error" title={friendlyError(history.error)} /> : (history.data ?? []).length === 0 ? <p className="text-text-secondary">Todavía no tiene turnos.</p> : (
        <div className="overflow-x-auto border border-border-subtle"><Table label={`Turnos de ${clientName(c)}`}>
          <thead><tr><Th>Cola</Th><Th>Turno</Th><Th>Fecha</Th><Th>Estado</Th></tr></thead>
          <tbody>{(history.data ?? []).map((t) => <tr key={t.id}><Td>{t.queueName ?? '—'}</Td><Td className="font-mono">{t.number ?? '—'}</Td><Td>{fmtDate(t.createdAt)}</Td><Td><TurnBadge status={parseTicketStatus(t.status)} /></Td></tr>)}</tbody>
        </Table></div>
      )}
      {manage && (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
          <h3 className="t-h4">Acceso a turnos</h3>
          {c.blocked ? (
            <>
              <Notice kind="warning" title="Este cliente está bloqueado." message={info.data?.reason ? `Motivo: ${info.data.reason}` : 'No puede sacar turnos en tu organización.'} />
              <div><Button kind="secondary" loading={busy} onClick={() => void toggle()}>Desbloquear</Button></div>
            </>
          ) : (
            <>
              <TextField label="Motivo (opcional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} helper="Solo lo ve tu equipo." />
              <div><Button kind="danger" icon="noshow" loading={busy} onClick={() => void toggle()}>Bloquear cliente</Button></div>
            </>
          )}
          <h3 className="t-h4 mt-2">Datos del cliente</h3>
          <EditPermissionSection client={c} orgId={orgId} permission={permission.data ?? null} loading={permission.isLoading} onChanged={() => { void permission.refetch(); onChanged(); }} />
          <h3 className="t-h4 mt-2">Eliminar cliente</h3>
          <p className="t-caption m-0 text-text-secondary">Lo quita de tu lista y borra su historial de turnos en tu organización. Su cuenta no se toca y puede volver a aparecer si saca un turno otra vez.</p>
          <div><Button kind="danger" icon="trash" loading={busy} onClick={() => setConfirmRemove(true)}>Eliminar cliente</Button></div>
        </div>
      )}
      {confirmRemove && <ConfirmDialog title="Eliminar cliente" message={`Se borrará el historial de ${clientName(c)} en tu organización y desaparecerá de tu lista. No se puede deshacer.`} confirmLabel="Eliminar cliente" onCancel={() => setConfirmRemove(false)} onConfirm={() => void remove()} />}
    </Dialog>
  );
}

/** Editar datos de un cliente exige su permiso: se pide, él lo aprueba desde la app móvil y sirve para un cambio en 24 h. */
function EditPermissionSection({ client: c, orgId, permission, loading, onChanged }: { client: Client; orgId: string; permission: EditPermission | null; loading: boolean; onChanged: () => void }) {
  const { clients } = useContainer();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [f, setF] = useState({ firstName: c.firstName, lastName: c.lastName, phone: c.phone ?? '' });
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  if (loading) return <Skeleton height={48} />;

  async function request() {
    setBusy(true);
    const r = await clients.requestEdit(orgId, c.userId, reason.trim());
    setBusy(false);
    if (r.ok) { setReason(''); toast.show('Enviamos la solicitud al cliente.'); onChanged(); } else toast.show(r.failure.message, { error: true });
  }
  async function save() {
    const e = { firstName: validatePersonName(f.firstName, 'el nombre'), lastName: validatePersonName(f.lastName, 'el apellido'), phone: f.phone.trim() && !isValidPhone(f.phone) ? 'Escribe un teléfono válido, con 7 a 15 dígitos.' : null };
    setErrs(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    const r = await clients.edit(orgId, c.userId, { firstName: f.firstName.trim(), lastName: f.lastName.trim(), phone: f.phone.trim() });
    setBusy(false);
    if (r.ok) { toast.show('Datos actualizados. Para otro cambio hay que pedir permiso de nuevo.'); onChanged(); } else toast.show(r.failure.message, { error: true });
  }

  if (permission?.status === 'pendiente') return <Notice kind="info" title="Esperando el permiso del cliente." message="Le llegó la solicitud a su app. Vence en 48 horas." />;
  if (permission?.status === 'aprobada') return (
    <div className="flex flex-col gap-3">
      <Notice kind="success" title="El cliente dio su permiso." message="Puedes hacer un cambio en las próximas 24 horas." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField label="Nombre" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} error={errs.firstName} maxLength={60} />
        <TextField label="Apellido" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} error={errs.lastName} maxLength={60} />
        <TextField label="Teléfono" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errs.phone} autoComplete="off" />
      </div>
      <div><Button loading={busy} onClick={() => void save()}>Guardar cambios</Button></div>
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {permission?.status === 'rechazada' && <Notice kind="warning" title="El cliente no dio su permiso." />}
      <p className="t-caption m-0 text-text-secondary">Para cambiar su nombre o teléfono, el cliente tiene que autorizarlo. Por su privacidad no se puede editar sin su permiso.</p>
      {canRequestEdit(permission) && <>
        <TextField label="Motivo de la solicitud (opcional)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} helper="El cliente lo verá al responder." />
        <div><Button kind="secondary" loading={busy} onClick={() => void request()}>Pedir permiso para editar</Button></div>
      </>}
    </div>
  );
}
