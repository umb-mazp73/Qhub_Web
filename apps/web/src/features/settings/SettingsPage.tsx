import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unwrap, validateOrgName } from '@qhub/core';
import { isReady } from '@qhub/api-client';
import { Button, ConfirmDialog, Notice, PageHead, Panel, Skeleton, TextField, useToast } from '@/shared/ui';
import { CredentialsDialog } from '@/features/qhub/CredentialsDialog';
import { useContainer, useSession } from '@/app/container';
import { LocationFields } from '@/features/geo/LocationFields';

export function SettingsPage() {
  const { staff, health, qhubLink } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const org = session.membership!.organization;
  const personal = org.kind === 'persona';
  const space = personal ? 'tu cuenta' : 'tu organización';
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'connect' | 'unpublish' | 'forget' | null>(null);
  const [loc, setLoc] = useState({ country: org.country ?? '', city: org.city ?? '', timeZone: org.timeZone });
  const [nameErr, setNameErr] = useState<string | null>(null);
  const device = useQuery({ queryKey: ['device-connection', org.id], queryFn: () => session.hasDeviceConnection() });
  const saved = org.linked || !!device.data;
  const ready = useQuery({ queryKey: ['health'], queryFn: async () => unwrap(await health.ready()) });

  async function save() {
    const e = validateOrgName(name, personal ? 'tu cuenta' : 'la organización');
    setNameErr(e);
    if (e) return;
    setBusy(true);
    const r = await staff.updateOrganization(org.id, { name: name.trim(), city: loc.city, country: loc.country });
    setBusy(false);
    if (r.ok) { void staff.audit(org.id, 'organizacion.editar', { entity: 'organizacion', entityId: org.id }); await session.loadMemberships(); toast.show('Cambios guardados.'); } else toast.show(r.failure.message, { error: true });
  }

  const done = async (r: { ok: boolean; failure?: { message: string } }, ok: string) => {
    setBusy(false);
    if (r.ok) { await session.loadMemberships(); toast.show(ok); } else toast.show(r.failure?.message ?? 'No pudimos completar la acción.', { error: true });
    return r.ok;
  };
  const shown = personal ? 'Tu cuenta' : 'Tu organización';
  const publish = async () => { setBusy(true); await done(await qhubLink.publish(org.id), `${shown} ya aparece en la app móvil.`); };
  /** Sin conexión guardada: se pide la cuenta Qhub una vez, se guarda en el servidor y se publica. */
  async function connectAndPublish(identifier: string, password: string): Promise<string | null> {
    const c = await qhubLink.connect(org.id, identifier, password);
    if (!c.ok) return c.failure.message;
    setDialog(null); setBusy(true);
    await done(await qhubLink.publish(org.id), `${shown} ya aparece en la app móvil.`);
    return null;
  }
  const unpublish = async () => { setDialog(null); setBusy(true); await done(await qhubLink.unpublish(org.id), 'Ya no aparece en la app móvil.'); };
  async function forget() {
    setDialog(null); setBusy(true);
    const r = org.linked ? await qhubLink.disconnect(org.id) : { ok: true as const };
    if (r.ok) await session.forgetDeviceConnection();       // también la de este dispositivo; la puerta de acceso pedirá conectar de nuevo
    await done(r, 'Olvidamos la conexión guardada.');
  }

  return (
    <div>
      <PageHead title="Ajustes" breadcrumb="Administración" />
      <div className="flex flex-col gap-4">
        <Panel title={personal ? 'Tu cuenta personal' : 'Organización'}>
          <div className="flex flex-col gap-4"><TextField label={personal ? 'Nombre con el que te ve el público' : 'Nombre'} value={name} onChange={(e) => { setName(e.target.value); setNameErr(null); }} error={nameErr} maxLength={80} />
            <LocationFields storeAs="name" value={loc} onChange={setLoc} withTimeZone={false} /><div><Button icon="check" loading={busy} onClick={() => void save()}>Guardar</Button></div></div>
        </Panel>
        <Panel title="ID de tu organización">
          <div className="flex flex-col gap-3">
            <p className="m-0 text-text-secondary">Los clientes te buscan en la app móvil por tu nombre o por este ID, y se vinculan a tu organización para ver tus colas y sacar turno. Compártelo en tu local o en tus redes.</p>
            <div className="flex flex-wrap items-center gap-3">
              <code aria-label="ID de la organización" className="select-all border border-border-subtle bg-layer-02 px-3 py-2 font-mono t-h4">{org.code || '—'}</code>
              <Button kind="secondary" icon="copy" disabled={!org.code} onClick={async () => { await navigator.clipboard?.writeText(org.code); toast.show('ID copiado.'); }}>Copiar ID</Button>
            </div>
            {!org.published && <Notice kind="warning" title="Todavía no te pueden encontrar." message="Publica tu organización en la app móvil para que aparezca en las búsquedas." />}
          </div>
        </Panel>
        <Panel title="App móvil">
          <div className="flex flex-col gap-4">
            <Notice kind={org.published ? 'success' : 'info'} title={org.published ? `${shown} está publicada en la app móvil.` : `${shown} aún no aparece en la app móvil.`}
              message="El público podrá ver tus colas y sacar turnos. La contraseña de Qhub se guarda solo en el servidor, nunca en la app." />
            <div>{org.published
              ? <Button kind="secondary" loading={busy} onClick={() => setDialog('unpublish')}>Dejar de publicar</Button>
              : <Button icon="arrow-right" loading={busy} onClick={() => (org.linked ? void publish() : setDialog('connect'))}>Publicar en la app móvil</Button>}</div>
          </div>
        </Panel>
        <Panel title="Conexión con Qhub">
          <div className="flex flex-col gap-4">
            <Notice kind={saved ? 'success' : 'warning'} title={org.linked ? 'La conexión con Qhub está guardada en el servidor.' : device.data ? 'La conexión con Qhub está guardada en este dispositivo.' : 'La conexión con Qhub es solo de esta sesión.'}
              message={saved ? 'No tendrás que volver a conectar tu cuenta al iniciar sesión: entras directo.' : 'Guárdala para no tener que conectar tu cuenta cada vez que inicies sesión.'} />
            {ready.isLoading ? <Skeleton height={48} /> : ready.isError ? <Notice kind="error" title="No pudimos comprobar el estado del servicio." /> : (
              <Notice kind={isReady(ready.data!) ? 'success' : 'warning'} title={isReady(ready.data!) ? 'El servicio funciona con normalidad.' : 'El servicio tiene un problema temporal.'} message={isReady(ready.data!) ? undefined : 'Algunas funciones pueden tardar o fallar. Inténtalo de nuevo en unos minutos.'} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button kind="tertiary" onClick={() => void ready.refetch()}>Probar de nuevo</Button>
              {saved ? <Button kind="secondary" loading={busy} onClick={() => setDialog('forget')}>Olvidar la conexión guardada</Button>
                : <Button kind="secondary" onClick={() => setDialog('connect')}>Guardar la conexión</Button>}
            </div>
          </div>
        </Panel>
      </div>
      {dialog === 'connect' && <CredentialsDialog title="Conectar tu cuenta de Qhub" intro="Lo haces una sola vez: validamos tu cuenta, la guardamos en el servidor y después entras directo." confirmLabel="Conectar y publicar" onSubmit={connectAndPublish} onCancel={() => setDialog(null)} />}
      {dialog === 'unpublish' && <ConfirmDialog title="Dejar de publicar" message={`El público dejará de ver ${space}. Los turnos ya sacados se conservan.`} confirmLabel="Dejar de publicar" danger={false} onCancel={() => setDialog(null)} onConfirm={() => void unpublish()} />}
      {dialog === 'forget' && <ConfirmDialog title="Olvidar la conexión guardada" message={`La próxima vez tendrás que conectar tu cuenta de Qhub otra vez y ${space} dejará de verse en la app móvil.`} confirmLabel="Olvidar conexión" onCancel={() => setDialog(null)} onConfirm={() => void forget()} />}
    </div>
  );
}
