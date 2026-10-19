import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { countryByAny, unwrap, initialsOf, friendlyError } from '@qhub/core';
import { Avatar, Button, ConfirmDialog, Notice, PageHead, Panel, Select, Skeleton, Switch, Tabs, TextField, useToast } from '@/shared/ui';
import { SecurityTab } from './SecurityTab';
import { useContainer, useSession } from '@/app/container';
import { applyPreferences, getPreferences, REFRESH_OPTIONS, refreshLabel, type Preferences, type RefreshSeconds, type ThemeMode } from '@/features/preferences/preferences';
import { EMPTY_PROFILE, ORG_ROLE_HINT, ORG_ROLE_LABEL, validateProfile, type Profile } from '@/features/staff';
import { LocationFields } from '@/features/geo/LocationFields';
import { PhoneField } from '@/features/geo/PhoneField';

const TABS = ['Datos personales', 'Seguridad', 'Preferencias', 'Cuenta'] as const;
const TAB_KEYS = ['datos', 'seguridad', 'preferencias', 'cuenta'] as const;
const THEMES: ReadonlyArray<{ value: ThemeMode; label: string }> = [{ value: 'system', label: 'Igual que el sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }];

export function ProfilePage() {
  const { session } = useSession();
  const [params, setParams] = useSearchParams();
  const tab = Math.max(0, TAB_KEYS.indexOf((params.get('tab') ?? 'datos') as (typeof TAB_KEYS)[number]));
  const setTab = (i: number) => setParams(i === 0 ? {} : { tab: TAB_KEYS[i]! }, { replace: true });
  const user = session.user!;
  const m = session.membership;
  return (
    <div>
      <PageHead title="Mi perfil" breadcrumb="Cuenta" />
      <div className="mb-6 flex items-center gap-4">
        <Avatar text={initialsOf(user.displayName, user.email)} size="lg" />
        <div className="min-w-0">
          <div className="t-h3 truncate">{user.displayName ?? user.email}</div>
          <div className="text-text-secondary">{user.email}{m && <> · {ORG_ROLE_LABEL[m.role]} en {m.organization.name}</>}</div>
        </div>
      </div>
      <div className="mb-6 overflow-x-auto"><Tabs labels={TABS} index={tab} onChange={setTab} /></div>
      {tab === 0 && <><PersonalTab />{m && m.organization.kind === 'empresa' && m.role !== 'admin' && <AskAdminPanel orgId={m.organization.id} />}</>}
      {tab === 1 && <SecurityTab />}
      {tab === 2 && <PreferencesTab />}
      {tab === 3 && <AccountTab />}
    </div>
  );
}

function PersonalTab() {
  const { staff } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['profile'], queryFn: async () => unwrap(await staff.profile()) });
  const mem = session.membership;
  const managed = !!mem && mem.organization.kind === 'empresa' && mem.role !== 'admin';      // sus datos los gestiona el administrador
  const [form, setForm] = useState<Profile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState<Profile>(EMPTY_PROFILE);
  const [errs, setErrs] = useState<Partial<Record<keyof Profile, string>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    const c = countryByAny(q.data.country);
    const p = { ...q.data, country: c?.code ?? q.data.country };
    setForm(p); setSaved(p);
  }, [q.data]);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };

  async function save() {
    const e = validateProfile(form);
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await staff.updateProfile(form);
    setBusy(false);
    if (r.ok) { setSaved(form); void qc.invalidateQueries({ queryKey: ['profile'] }); toast.show('Perfil actualizado.'); } else toast.show(r.failure.message, { error: true });
  }

  if (q.isLoading) return <Skeleton height={240} />;
  if (q.isError) return <Notice kind="error" title={friendlyError(q.error)} />;
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate aria-label="Datos personales">
      {managed && <Notice kind="info" title="Tu administrador gestiona tu nombre, apellido, cargo y teléfono." message="Si algo está mal, envíale una solicitud más abajo en «Pedir un cambio al administrador»." />}
      <Panel title="Identidad">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Nombre" disabled={managed && !!saved.firstName} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} error={errs.firstName} autoComplete="given-name" maxLength={60} />
          <TextField label="Apellido" disabled={managed && !!saved.lastName} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} error={errs.lastName} autoComplete="family-name" maxLength={60} />
          <TextField label="Correo" value={session.user?.email ?? ''} readOnly helper="Es tu identificador de acceso; no se edita aquí." />
          <TextField label="Cargo" disabled={managed && !!saved.jobTitle} value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} error={errs.jobTitle} autoComplete="organization-title" maxLength={80} helper="Opcional. Por ejemplo, Jefa de sucursal." />
        </div>
      </Panel>
      <Panel title="Contacto">
        <PhoneField disabled={managed && !!saved.phone} value={form.phone} onChange={(v) => set('phone', v)} error={errs.phone} defaultCountry={countryByAny(form.country)?.code ?? 'EC'} />
      </Panel>
      <Panel title="Ubicación">
        <LocationFields value={{ country: form.country, city: form.city, timeZone: form.timeZone }} errors={{ country: errs.country }}
          onChange={(l) => { setForm((f) => ({ ...f, country: l.country, city: l.city, timeZone: l.timeZone })); setErrs((e) => ({ ...e, country: undefined })); }} />
      </Panel>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" icon="check" loading={busy} disabled={!dirty}>Guardar cambios</Button>
        <Button kind="ghost" disabled={!dirty || busy} onClick={() => { setForm(saved); setErrs({}); }}>Descartar</Button>
        {dirty && <span className="t-caption text-text-secondary" role="status">Tienes cambios sin guardar.</span>}
      </div>
    </form>
  );
}

function PreferencesTab() {
  const [p, setP] = useState<Preferences>(getPreferences);
  const set = (patch: Partial<Preferences>) => { const n = { ...p, ...patch }; setP(n); applyPreferences(n); };
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Apariencia">
        <Select<ThemeMode> label="Tema" value={p.theme} options={THEMES} onValueChange={(theme) => set({ theme })} />
      </Panel>
      <Panel title="Actualización automática">
        <Select<RefreshSeconds> label="Actualizar los datos de las pantallas" value={p.refreshSeconds} options={REFRESH_OPTIONS.map((v) => ({ value: v, label: refreshLabel(v) }))} onValueChange={(refreshSeconds) => set({ refreshSeconds })} />
        <p className="t-caption mt-2 text-text-secondary">Aplica a inicio, colas, clientes, avisos e historial. Los gráficos del historial no se recargan antes de 30 s.</p>
      </Panel>
      <Panel title="Accesibilidad">
        <div className="divide-y divide-border-subtle">
          <Switch label="Texto más grande" hint="Aumenta el tamaño de toda la interfaz un 15 %." checked={p.largeText} onChange={(largeText) => set({ largeText })} />
          <Switch label="Reducir movimiento" hint="Quita animaciones y transiciones." checked={p.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} />
          <Switch label="Contraste alto" hint="Refuerza bordes y textos secundarios." checked={p.highContrast} onChange={(highContrast) => set({ highContrast })} />
        </div>
        <p className="t-caption mt-3 text-text-secondary">Estas preferencias se guardan en este navegador.</p>
      </Panel>
    </div>
  );
}

function AccountTab() {
  const { staff } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const m = session.membership;

  async function remove() {
    setBusy(true);
    const r = await staff.deleteAccount();
    setBusy(false);
    setOpen(false);
    if (r.ok) { session.disconnect(); toast.show('Tu cuenta se eliminó.'); } else toast.show(r.failure.message, { error: true });
  }

  return (
    <div className="flex flex-col gap-4">
      {m && (
        <Panel title="Tu rol">
          <p><strong>{ORG_ROLE_LABEL[m.role]}</strong> en {m.organization.name}.</p>
          <p className="text-text-secondary">{ORG_ROLE_HINT[m.role]}</p>
        </Panel>
      )}
      <Panel title="Zona de peligro">
        <div className="flex flex-col items-start gap-3">
          <p className="text-text-secondary">Eliminar tu cuenta borra tu perfil, tus accesos y tus favoritos. No se puede deshacer. Si eres el único administrador de una organización con más gente, antes debes nombrar a otro; si eres el único miembro, la organización también se elimina.</p>
          <Button kind="danger" icon="trash" onClick={() => { setTyped(''); setOpen(true); }}>Eliminar cuenta</Button>
        </div>
      </Panel>
      {open && (
        <ConfirmDialog title="Eliminar cuenta" confirmLabel={busy ? 'Eliminando…' : 'Eliminar'} onCancel={() => setOpen(false)}
          message="Para confirmar, escribe ELIMINAR en el campo de abajo."
          extra={<TextField label="Confirmación" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
          confirmDisabled={typed.trim() !== 'ELIMINAR' || busy} onConfirm={() => void remove()} />
      )}
    </div>
  );
}

/** Quien no es administrador no puede cambiar ciertos datos por su cuenta: se los pide al administrador. */
function AskAdminPanel({ orgId }: { orgId: string }) {
  const { staff } = useContainer();
  const toast = useToast();
  const perm = useQuery({ queryKey: ['my-permission', orgId, 'datos'], queryFn: async () => unwrap(await staff.myPermission(orgId, 'datos')) });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const waiting = perm.data?.status === 'pendiente';
  async function ask() {
    if (reason.trim().length < 5) { toast.show('Cuéntale al administrador qué necesitas cambiar.', { error: true }); return; }
    setBusy(true);
    const r = await staff.requestChange(orgId, 'datos', reason.trim());
    setBusy(false);
    if (r.ok) { setReason(''); toast.show('Enviamos tu solicitud al administrador.'); void perm.refetch(); } else toast.show(r.failure.message, { error: true });
  }
  return (
    <div className="mt-4"><Panel title="Pedir un cambio al administrador">
      <div className="flex max-w-[520px] flex-col gap-3">
        <p className="m-0 text-text-secondary">¿Necesitas corregir algo que no puedes cambiar tú? Dile al administrador qué y él lo hace.</p>
        {waiting ? <Notice kind="info" title="Tu solicitud está esperando respuesta." /> : <>
          <TextField label="¿Qué quieres cambiar?" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div><Button kind="secondary" loading={busy} onClick={() => void ask()}>Enviar solicitud</Button></div>
        </>}
      </div>
    </Panel></div>
  );
}
