import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { generatePassword, initialsOf, passwordStrength, validatePassword, unwrap, validateEmail, validatePersonName, isValidPhone, friendlyError } from '@qhub/core';
import { Avatar, StrengthMeter, Button, cx, ConfirmDialog, Dialog, Icon, EmptyState, EmailField, IconButton, Notice, PageHead, Panel, Select, Skeleton, TextField, useToast } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { can } from '@/features/staff/permissions';
import { OUTCOME_LABEL, REQUEST_LABEL, type Member, invitationLabel, invitationPending, maskToken, ORG_ROLES, ORG_ROLE_HINT, ORG_ROLE_LABEL, type OrgRole } from '@/features/staff';

const ROLES = ORG_ROLES.map((r) => ({ value: r, label: ORG_ROLE_LABEL[r] }));

export function TeamPage() {
  const { staff } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const orgId = session.membership!.organization.id;
  const me = session.user?.id;
  const canManage = can(session.membership?.role, 'team.manage');
  const members = useQuery({ queryKey: ['members', orgId], queryFn: async () => unwrap(await staff.members(orgId)) });
  const invitations = useQuery({ queryKey: ['invitations', orgId], queryFn: async () => unwrap(await staff.invitations(orgId)) });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('agente');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const requests = useQuery({ queryKey: ['member-requests', orgId], enabled: canManage, queryFn: async () => unwrap(await staff.pendingRequests(orgId)) });
  const history = useQuery({ queryKey: ['request-history', orgId], enabled: canManage, queryFn: async () => unwrap(await staff.requestHistory(orgId)) });
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [position, setPosition] = useState('');
  const [errs, setErrs] = useState<{ first?: string | null; last?: string | null; position?: string | null }>({});
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Set<string>>(new Set());     // códigos de invitación a la vista (por defecto censurados)
  const [editing, setEditing] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const toggleShown = (id: string) => setShown((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const pendingList = (invitations.data ?? []).filter((i) => invitationPending(i));

  function reportSent(r: { sent: boolean; reason?: string }, email: string) {
    if (r.sent) toast.show(`Enviamos la invitación a ${email}.`);
    else toast.show(r.reason === 'limite'
      ? 'La invitación quedó creada, pero hay demasiados correos seguidos. Reenvíala en unos minutos o comparte el código.'
      : 'La invitación quedó creada, pero no pudimos enviar el correo. Reenvíala o comparte el código.', { error: true });
  }

  async function invite() {
    const e = validateEmail(email)
      ?? (session.user?.email && email.trim().toLowerCase() === session.user.email.toLowerCase() ? 'Ese es tu propio correo.' : null);
    const opt = (v: string, what: string) => (v.trim() ? validatePersonName(v, what) : null);
    const n = { first: opt(first, 'el nombre'), last: opt(last, 'el apellido'), position: position.trim() && position.trim().length < 2 ? 'Escribe el cargo completo.' : null };
    const pe = password ? validatePassword(password, { email }) : null;
    setEmailErr(e); setErrs(n); setPwErr(pe);
    if (e || n.first || n.last || n.position || pe) return;
    setBusy(true);
    const r = await staff.invite(orgId, { email: email.trim(), role, ...(password ? { password } : {}), ...(first.trim() ? { firstName: first.trim() } : {}), ...(last.trim() ? { lastName: last.trim() } : {}), ...(position.trim() ? { position: position.trim() } : {}) });
    setBusy(false);
    if (!r.ok) { toast.show(r.failure.message, { error: true }); return; }
    const given = password;
    setEmail(''); setFirst(''); setLast(''); setPosition(''); setPassword('');
    void qc.invalidateQueries({ queryKey: ['invitations', orgId] });
    if (given && r.value.passwordSet) setCredentials({ email: r.value.invitation.email, password: given });     // única vez que se muestra
    else if (given) toast.show('Esa persona ya tenía cuenta: no cambiamos su contraseña. Entra con la suya.', { error: true });
    reportSent(r.value, r.value.invitation.email);
  }

  async function resend(id: string, to: string) {
    setWorking(id);
    const r = await staff.resendInvitation(orgId, id);
    setWorking(null);
    if (!r.ok) { toast.show(r.failure.message, { error: true }); return; }
    void qc.invalidateQueries({ queryKey: ['invitations', orgId] });
    reportSent(r.value, to);
  }

  async function cancel(id: string) {
    setWorking(id);
    const r = await staff.cancelInvitation(id);
    setWorking(null);
    if (r.ok) { void staff.audit(orgId, 'invitacion.cancelar', { entity: 'invitacion', entityId: id, detail: { email: pendingList.find((i) => i.id === id)?.email ?? '' } }); void qc.invalidateQueries({ queryKey: ['invitations', orgId] }); toast.show('Invitación cancelada.'); } else toast.show(r.failure.message, { error: true });
  }

  async function answer(id: string, approve: boolean) {
    const r = await staff.respondRequest(id, approve);
    if (r.ok) { void qc.invalidateQueries({ queryKey: ['member-requests', orgId] }); void qc.invalidateQueries({ queryKey: ['request-history', orgId] }); toast.show(approve ? 'Solicitud aprobada. Le avisamos a la persona.' : 'Solicitud rechazada. Le avisamos a la persona.'); } else toast.show(r.failure.message, { error: true });
  }

  async function change(userId: string, patch: { role?: OrgRole; active?: boolean }) {
    const r = await staff.updateMember(orgId, userId, patch);
    if (r.ok) {
      void staff.audit(orgId, patch.role ? 'miembro.rol' : 'miembro.acceso', { entity: 'miembro', entityId: userId, detail: patch.role ? { rol: ORG_ROLE_LABEL[patch.role].toLowerCase() } : { activo: String(patch.active) } });
      void qc.invalidateQueries({ queryKey: ['members', orgId] });
    } else toast.show(r.failure.message, { error: true });
  }

  return (
    <div>
      <PageHead title="Equipo" breadcrumb={canManage ? 'Administración' : 'Consulta'} />
      <div className="flex flex-col gap-4">
        {canManage && <Panel title="Invitar a alguien">
          <div className="flex flex-col gap-3">
            <p className="t-caption m-0 text-text-secondary">Le enviamos un correo con un botón para aceptar. Si quieres, déjale el perfil listo: al aceptar entra directo.</p>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
              <div className="flex-[2]"><EmailField label="Correo" value={email} onValueChange={(v) => { setEmail(v); setEmailErr(null); }} error={emailErr} /></div>
              <div className="flex-1"><Select<OrgRole> label="Rol" value={role} options={ROLES} onValueChange={setRole} /></div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1"><TextField label="Nombre (opcional)" value={first} onChange={(e) => { setFirst(e.target.value); setErrs((x) => ({ ...x, first: null })); }} error={errs.first} maxLength={60} autoComplete="off" /></div>
              <div className="flex-1"><TextField label="Apellido (opcional)" value={last} onChange={(e) => { setLast(e.target.value); setErrs((x) => ({ ...x, last: null })); }} error={errs.last} maxLength={60} autoComplete="off" /></div>
              <div className="flex-1"><TextField label="Cargo (opcional)" value={position} onChange={(e) => { setPosition(e.target.value); setErrs((x) => ({ ...x, position: null })); }} error={errs.position} maxLength={80} autoComplete="off" /></div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1"><TextField label="Contraseña inicial (opcional)" type="password" revealable value={password} onChange={(e) => { setPassword(e.target.value); setPwErr(null); }} error={pwErr}
                  autoComplete="new-password" helper="Si la pones, la persona entra con su correo y esta contraseña. Después solo podrá cambiarla con tu permiso." /></div>
                <div className="sm:pt-5"><Button kind="secondary" onClick={() => { setPassword(generatePassword()); setPwErr(null); }}>Generar</Button></div>
              </div>
              {password && <StrengthMeter score={passwordStrength(password)} empty={false} />}
            </div>
            <p className="t-caption m-0 text-text-secondary">{ORG_ROLE_HINT[role]}</p>
            <div><Button icon="arrow-right" loading={busy} onClick={() => void invite()}>Enviar invitación</Button></div>
          </div>
        </Panel>}
        {canManage && (requests.data?.length ?? 0) > 0 && <Panel title="Solicitudes del equipo">
          <ul className="m-0 list-none p-0">
            {requests.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle py-3 first:border-t-0">
                <div className="min-w-0 flex-1 basis-60">
                  <strong className="block truncate">{r.name}</strong>
                  <span className="text-text-secondary">{REQUEST_LABEL[r.type]}</span>
                  {r.reason && <span className="t-caption block text-text-secondary">“{r.reason}”</span>}
                  {r.type === 'datos' && <span className="t-caption block text-text-secondary">Corrige sus datos con «Editar» en la lista de miembros y marca la solicitud como atendida.</span>}
                </div>
                <Button size="sm" onClick={() => void answer(r.id, true)}>{r.type === 'datos' ? 'Atendida' : 'Aprobar'}</Button>
                <Button size="sm" kind="secondary" onClick={() => void answer(r.id, false)}>Rechazar</Button>
              </li>
            ))}
          </ul>
        </Panel>}
        {canManage && (history.data?.length ?? 0) > 0 && <Panel title="Historial de solicitudes">
          <ul className="m-0 list-none p-0">
            {history.data!.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle py-2 first:border-t-0">
                <div className="min-w-0 flex-[2] basis-56"><strong className="block truncate">{h.name}</strong><span className="text-text-secondary">{REQUEST_LABEL[h.type]}</span>{h.reason && <span className="t-caption block truncate text-text-secondary">“{h.reason}”</span>}</div>
                <span className={cx('inline-flex flex-1 basis-40 items-center gap-1', h.outcome === 'rechazada' ? 'text-support-error' : h.outcome === 'vencida' ? 'text-text-secondary' : 'text-state-done-text')}>
                  <Icon name={h.outcome === 'rechazada' ? 'error' : h.outcome === 'vencida' ? 'clock' : 'check'} />{OUTCOME_LABEL[h.outcome]}</span>
                <span className="t-caption basis-40 text-text-secondary">{(h.answeredAt ?? h.requestedAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short', hour12: false })}</span>
              </li>
            ))}
          </ul>
        </Panel>}
        <Panel title="Miembros">
          {members.isLoading ? <Skeleton height={80} /> : members.isError ? <Notice kind="error" title={friendlyError(members.error)} /> : (
            <ul className="m-0 list-none p-0">
              {(members.data ?? []).map((m) => {
                const self = m.userId === me;
                return (
                  <li key={m.userId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-t border-border-subtle py-3 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar size="sm" text={initialsOf(m.name, '')} />
                      <div className="min-w-0">
                        <strong className="block truncate">{m.name}{self ? ' (tú)' : ''}</strong>
                        <span className={cx('t-caption inline-flex items-center gap-1', m.active ? 'text-state-done-text' : 'text-text-secondary')}><Icon name={m.active ? 'check' : 'close'} size={12} />{m.active ? 'Activo' : 'Inactivo'}</span>
                      </div>
                    </div>
                    <div className="col-span-2 lg:col-span-1">
                      <Select<OrgRole> hideLabel label={`Rol de ${m.name}`} value={m.role} options={ROLES} disabled={self || !canManage} onValueChange={(r) => void change(m.userId, { role: r })} />
                    </div>
                    <label className={cx('inline-flex items-center gap-2', canManage && !self ? 'cursor-pointer' : 'cursor-not-allowed text-text-disabled')}>
                      <input type="checkbox" role="switch" aria-label={`${m.name} activo`} checked={m.active} disabled={self || !canManage} onChange={(e) => void change(m.userId, { active: e.target.checked })} className="size-[18px] accent-interactive" />
                      <span className="t-caption">Acceso</span>
                    </label>
                    {canManage && !self ? <span className="flex items-center justify-end gap-1">
                      <Button kind="tertiary" size="sm" onClick={() => setEditing(m)}>Editar</Button>
                      <IconButton icon="trash" label={`Quitar a ${m.name} del equipo`} onClick={() => setRemoving(m)} />
                    </span> : <span />}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        {canManage && <Panel title="Invitaciones pendientes">
          {pendingList.length === 0 ? <p className="text-text-secondary">No hay invitaciones pendientes.</p> : pendingList.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-subtle py-2 sm:min-h-row">
              <div className="min-w-0 flex-[2] basis-48">
                <strong className="block truncate">{invitationLabel(i)}</strong>
                {(i.firstName || i.lastName) && <span className="t-caption block truncate text-text-secondary">{i.email}</span>}
              </div>
              <span className="flex-1 basis-24 text-text-secondary">{ORG_ROLE_LABEL[i.role]}</span>
              <span className="flex flex-[2] basis-48 items-center gap-2">
                <span aria-label={`Código de invitación de ${i.email}`} className="min-w-0 truncate font-mono t-caption text-text-secondary">{shown.has(i.id) ? i.token : maskToken(i.token)}</span>
                <button type="button" aria-pressed={shown.has(i.id)} aria-label={`${shown.has(i.id) ? 'Ocultar' : 'Mostrar'} el código de ${i.email}`} onClick={() => toggleShown(i.id)}
                  className="cursor-pointer border-0 bg-transparent p-0 text-link underline">{shown.has(i.id) ? 'Ocultar' : 'Mostrar'}</button>
                <IconButton icon="copy" label={`Copiar el código de ${i.email}`} onClick={async () => { await navigator.clipboard?.writeText(i.token); toast.show('Código copiado.'); }} />
              </span>
              <span className="flex items-center gap-1">
                <Button kind="tertiary" loading={working === i.id} onClick={() => void resend(i.id, i.email)}>Reenviar</Button>
                <IconButton icon="trash" label={`Cancelar la invitación de ${i.email}`} disabled={working === i.id} onClick={() => void cancel(i.id)} />
              </span>
            </div>
          ))}
        </Panel>}
        {credentials && <Dialog title="Invitación enviada" onClose={() => setCredentials(null)} actions={<Button onClick={() => setCredentials(null)}>Listo</Button>}>
          <div className="flex flex-col gap-3">
            <Notice kind="warning" title="Guarda esta contraseña ahora." message="Es la única vez que se muestra: no la guardamos. Compártela por un canal seguro." />
            <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border border-border-subtle bg-layer-02 p-4">
              <dt className="t-caption text-text-secondary">Correo</dt><dd className="m-0 truncate">{credentials.email}</dd>
              <dt className="t-caption text-text-secondary">Contraseña</dt><dd className="m-0 font-mono">{credentials.password}</dd>
            </dl>
            <div><Button kind="secondary" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(`Correo: ${credentials.email}\nContraseña: ${credentials.password}`); toast.show('Datos copiados.'); }}>Copiar datos</Button></div>
          </div>
        </Dialog>}
        {editing && <EditMemberDialog member={editing} orgId={orgId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void qc.invalidateQueries({ queryKey: ['members', orgId] }); toast.show('Perfil actualizado.'); }} />}
        {removing && <ConfirmDialog title="Quitar del equipo" message={`${removing.name} dejará de tener acceso a tu organización. Su cuenta no se borra: solo termina su pertenencia a este equipo.`} confirmLabel="Quitar del equipo"
          onCancel={() => setRemoving(null)} onConfirm={() => void (async () => {
            const r = await staff.removeMember(orgId, removing.userId); setRemoving(null);
            if (r.ok) { void qc.invalidateQueries({ queryKey: ['members', orgId] }); toast.show('Quitamos a la persona del equipo.'); } else toast.show(r.failure.message, { error: true });
          })()} />}
        {members.data?.length === 0 && <EmptyState title="Sin miembros" />}
      </div>
    </div>
  );
}

/** El administrador completa o corrige el perfil básico de alguien de su equipo (nunca de clientes). */
function EditMemberDialog({ member, orgId, onClose, onSaved }: { member: Member; orgId: string; onClose: () => void; onSaved: () => void }) {
  const { staff } = useContainer();
  const toast = useToast();
  const profile = useQuery({ queryKey: ['member-profile', orgId, member.userId], queryFn: async () => unwrap(await staff.memberProfile(orgId, member.userId)) });
  const [f, setF] = useState<{ firstName: string; lastName: string; position: string; phone: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const v = f ?? (profile.data ? { firstName: profile.data.firstName, lastName: profile.data.lastName, position: profile.data.position, phone: profile.data.phone } : null);
  const set = (k: keyof NonNullable<typeof v>, val: string) => { if (v) setF({ ...v, [k]: val }); setErrs((e) => ({ ...e, [k]: null })); };

  async function save() {
    if (!v) return;
    const e = {
      firstName: validatePersonName(v.firstName, 'el nombre'), lastName: validatePersonName(v.lastName, 'el apellido'),
      position: v.position.trim() && v.position.trim().length < 2 ? 'Escribe el cargo completo.' : null,
      phone: v.phone.trim() && !isValidPhone(v.phone) ? 'Escribe un teléfono válido, con 7 a 15 dígitos.' : null,
    };
    setErrs(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    const r = await staff.editMember(orgId, member.userId, { firstName: v.firstName.trim(), lastName: v.lastName.trim(), position: v.position.trim(), phone: v.phone.trim() });
    setBusy(false);
    if (r.ok) onSaved(); else toast.show(r.failure.message, { error: true });
  }

  return (
    <Dialog title={`Editar a ${member.name}`} onClose={onClose} actions={<><Button kind="ghost" onClick={onClose}>Cancelar</Button><Button loading={busy} disabled={!v} onClick={() => void save()}>Guardar</Button></>}>
      {profile.isLoading || !v ? (profile.isError ? <Notice kind="error" title={friendlyError(profile.error)} /> : <Skeleton height={160} />) : (
        <div className="flex flex-col gap-3">
          <p className="t-caption m-0 text-text-secondary">Correo: {profile.data?.email || '—'} (no se puede cambiar desde aquí). El rol y si está activo se cambian en la lista.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField label="Nombre" value={v.firstName} onChange={(e) => set('firstName', e.target.value)} error={errs.firstName} maxLength={60} />
            <TextField label="Apellido" value={v.lastName} onChange={(e) => set('lastName', e.target.value)} error={errs.lastName} maxLength={60} />
            <TextField label="Cargo (opcional)" value={v.position} onChange={(e) => set('position', e.target.value)} error={errs.position} maxLength={80} />
            <TextField label="Teléfono (opcional)" type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} error={errs.phone} autoComplete="off" />
          </div>
        </div>
      )}
    </Dialog>
  );
}
