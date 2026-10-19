import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { unwrap, friendlyError } from '@qhub/core';
import { Button, Checkbox, Icon, Logo, Notice, Panel, Skeleton, useToast } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { ORG_ROLE_HINT, ORG_ROLE_LABEL, spaceName } from '@/features/staff';
import { clearInvitation, pendingInvitation, rememberInvitation } from './pending-invitation';

/** Llegada desde el botón del correo: se ve a qué equipo te invitan, con el perfil que dejó el administrador, y se acepta. */
export function InvitationPage() {
  const { staff } = useContainer();
  const toast = useToast();
  const { session } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? pendingInvitation() ?? '';
  const [saved, setSaved] = useState(false);          // «ya copié y guardé mi contraseña»
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Invitación · Qhub'; rememberInvitation(token); }, [token]);

  const preview = useQuery({ queryKey: ['invitation-preview', token], enabled: token !== '', retry: false, queryFn: async () => unwrap(await staff.previewInvitation(token)) });

  const clave = useQuery({ queryKey: ['invitation-password', token], enabled: !!preview.data, retry: false, queryFn: async () => unwrap(await staff.initialPassword(token)) });
  const password = clave.data ?? null;

  async function accept() {
    setError(null);
    if (password && !saved) { setError('Confirma que ya copiaste y guardaste tu contraseña.'); return; }
    setBusy(true);
    const r = await staff.acceptInvitation(token);
    if (!r.ok) { setBusy(false); setError(r.failure.message); return; }
    await session.loadMemberships();
    setBusy(false);
    nav('/inicio', { replace: true });
    clearInvitation();         // después de salir de /invitacion: mientras se está aquí, la ruta vuelve a recordar el código
  }
  const decline = () => { nav('/inicio', { replace: true }); clearInvitation(); };
  async function switchAccount() { await session.signOut(); nav('/login', { replace: true }); clearInvitation(); }

  const p = preview.data;
  const who = p ? [p.firstName, p.lastName].filter(Boolean).join(' ') : '';
  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(520px,100%)]">
        <Panel>
          <div className="flex flex-col gap-4">
            <Logo height={28} />
            {preview.isLoading ? <Skeleton height={160} /> : !p ? (
              <>
                <div><h1 className="t-h2">No pudimos abrir esta invitación</h1>
                  <p className="text-text-secondary">{token ? friendlyError(preview.error) : 'Falta el código de la invitación. Abre el botón del correo que te enviamos.'}</p></div>
                <Notice kind="info" title="¿Entraste con otro correo?" message="La invitación solo sirve con el correo al que se envió. Cierra sesión e ingresa con ese correo." />
                <div className="flex flex-wrap gap-2">
                  <Button kind="secondary" onClick={() => void switchAccount()}>Cambiar de cuenta</Button>
                  <Button kind="tertiary" onClick={decline}>Ir al inicio</Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <h1 className="t-h2">Te invitaron a {p.organization}</h1>
                  <p className="text-text-secondary">Entrarás a {p.kind === 'persona' ? 'una' : 'la'} {spaceName(p.kind)} con el rol <strong className="font-medium text-text-primary">{ORG_ROLE_LABEL[p.role]}</strong>. {ORG_ROLE_HINT[p.role]}</p>
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border border-border-subtle bg-layer-02 p-4">
                  <dt className="t-caption text-text-secondary">Correo</dt><dd className="m-0 truncate">{p.email}</dd>
                  {who && <><dt className="t-caption text-text-secondary">Nombre</dt><dd className="m-0">{who}</dd></>}
                  {p.position && <><dt className="t-caption text-text-secondary">Cargo</dt><dd className="m-0">{p.position}</dd></>}
                </dl>
                {error && <Notice kind="error" title={error} />}
                {password && (
                  <div className="flex flex-col gap-3 border border-border-subtle p-4">
                    <h2 className="t-h4 m-0">Esta es tu contraseña</h2>
                    <p className="t-caption m-0 text-text-secondary">Tu administrador la asignó para ti. Cópiala y pégala en un lugar seguro, como un gestor de contraseñas. Después de aceptar no se vuelve a mostrar.</p>
                    <code className="select-all break-all border border-border-subtle bg-layer-02 px-3 py-2 font-mono">{password}</code>
                    <div><Button kind="secondary" icon="copy" onClick={async () => { await navigator.clipboard?.writeText(password); toast.show('Contraseña copiada. Pégala en un lugar seguro.'); }}>Copiar contraseña</Button></div>
                    <Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} label="Ya la copié y la guardé" />
                  </div>
                )}
                <Button size="lg" block icon="check" loading={busy} onClick={() => void accept()}>Aceptar invitación</Button>
                <p className="t-caption m-0 flex items-center gap-2 text-text-secondary"><Icon name="info" />Para cambiar tu contraseña o tus datos después, lo pides desde Mi perfil y tu administrador lo aprueba.</p>
                <Button kind="tertiary" onClick={decline}>Ahora no</Button>
              </>
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}
