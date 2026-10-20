import { useEffect, useRef, useState } from 'react';
import type { Failure } from '@qhub/core';
import { Button, cx, Icon, Logo, Notice, Panel, Tabs, TextField } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { CONFIRMED_KEY } from '@/features/session/app-session';
import { LocationFields } from '@/features/geo/LocationFields';
import { ACCOUNT_KINDS, type AccountKind } from '@/features/staff';
import { slugify, validateOrgName } from '@qhub/core';

/** Usuario sin organización: crea una o acepta una invitación. */
export function SetupPage() {
  const { staff } = useContainer();
  const { session } = useSession();
  const [tab, setTab] = useState(0);
  const pre = session.user?.pendingOrg;       // lo que eligió al crear la cuenta
  const [kind, setKind] = useState<AccountKind>(pre?.kind ?? 'empresa');
  const [name, setName] = useState(pre?.name ?? '');
  const [loc, setLoc] = useState({ country: pre?.country || 'Ecuador', city: pre?.city ?? '', timeZone: pre?.timeZone || 'America/Guayaquil' });
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const needsPassword = !session.hasHeldPassword;     // entró por el enlace del correo: no la escribió
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(p: Promise<{ ok: boolean; failure?: Failure }>) {
    const r = await p;
    setBusy(false);
    if (r.ok) await session.loadMemberships(); else setError(r.failure ?? null);
  }

  function create() {
    const e = validateOrgName(name, kind === 'persona' ? 'tu cuenta (el nombre con el que te verá el público)' : 'la organización');
    const ep = needsPassword && !pw ? 'Escribe tu contraseña.' : null;
    setErrs({ name: e, pw: ep }); setError(null);
    if (e || ep) return;
    if (needsPassword) session.holdPassword(pw);      // para crear tu cuenta Qhub con el mismo correo y contraseña
    setBusy(true);
    void finish(staff.createOrganization({ name, kind, slug: `${slugify(name)}-${Date.now() % 100000}`, city: loc.city || undefined, country: loc.country || undefined, timeZone: loc.timeZone }));
  }
  // Ya eligió todo al crear la cuenta: se crea la organización sola (si falta la contraseña, antes se le pide en el formulario).
  const auto = useRef(false);
  useEffect(() => {
    if (!pre || auto.current || !session.hasHeldPassword || !pre.city) return;
    auto.current = true; create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function accept() {
    const e = token.trim() ? null : 'Pega el código de invitación.';
    setErrs({ token: e }); setError(null);
    if (e) return;
    setBusy(true);
    void finish(staff.acceptInvitation(token));
  }

  // Entró por el enlace del correo sin escribir su contraseña: ya eligió todo al registrarse, así que se le lleva al inicio de sesión
  // (con la contraseña se crea y conecta todo, sin otro formulario).
  const toLogin = Boolean(pre && needsPassword);
  useEffect(() => {
    if (!toLogin) return;
    try { sessionStorage.setItem(CONFIRMED_KEY, '1'); } catch { /* sin storage */ }
    void session.signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toLogin]);
  // Ya eligió todo al registrarse y la organización se está creando sola: solo se ve la pantalla de carga, no el formulario (si falla, sí se muestra con el error).
  if (pre?.city && !needsPassword && !error) return <div role="status" aria-label="Cargando" className="grid h-full place-items-center"><Logo height={32} /></div>;
  if (toLogin) return <main id="contenido" className="grid min-h-full place-items-center p-6"><p className="text-text-secondary">Correo confirmado. Te llevamos a iniciar sesión…</p></main>;

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(520px,100%)]">
        <Panel>
          <div className="flex flex-col gap-4">
            <Logo height={28} />
            <div><h1 className="t-h2">Configura tu cuenta</h1><p className="text-text-secondary">Crea tu espacio o únete a un equipo con un código de invitación.</p></div>
            <Tabs labels={['Crear mi cuenta', 'Tengo una invitación']} index={tab} onChange={(i) => { setTab(i); setError(null); }} />
            {error && <Notice kind="error" title={error.message} />}
            {tab === 0 ? (
              <>
                <fieldset className="m-0 grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2">
                  <legend className="t-label mb-1 text-text-secondary">¿Cómo vas a usar Qhub?</legend>
                  {ACCOUNT_KINDS.map((k) => (
                    <label key={k.value} className={cx('flex cursor-pointer flex-col gap-1 border p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus', kind === k.value ? 'border-interactive bg-layer-02' : 'border-border-subtle bg-layer-01 hover:bg-layer-hover')}>
                      <input type="radio" name="tipo-cuenta" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                      <span className="flex items-center gap-2 font-medium"><Icon name={k.value === 'persona' ? 'user' : 'building'} />{k.label}{kind === k.value && <span className="ml-auto text-interactive"><Icon name="check" /></span>}</span>
                      <span className="t-caption text-text-secondary">{k.hint}</span>
                    </label>
                  ))}
                </fieldset>
                <TextField label={kind === 'persona' ? 'Nombre con el que te verá el público' : 'Nombre de la organización'} value={name} onChange={(e) => setName(e.target.value)} error={errs.name}
                  helper={kind === 'persona' ? 'Por ejemplo, tu nombre o el de tu consultorio.' : undefined} />
                <LocationFields storeAs="name" value={loc} onChange={setLoc} />
                {needsPassword && <TextField label="Tu contraseña" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} error={errs.pw} autoComplete="current-password" helper="La misma de tu cuenta: con ella creamos tu cuenta Qhub, así usas una sola." />}
                <Button size="lg" block icon="arrow-right" loading={busy} onClick={create}>{kind === 'persona' ? 'Crear mi cuenta' : 'Crear organización'}</Button>
              </>
            ) : (
              <>
                <TextField label="Código de invitación" type="password" revealable value={token} onChange={(e) => setToken(e.target.value)} error={errs.token} helper="Te lo comparte un administrador de la organización." />
                <Button size="lg" block icon="arrow-right" loading={busy} onClick={accept}>Unirme</Button>
              </>
            )}
            <div><Button kind="ghost" size="sm" onClick={() => void session.signOut()}>Cerrar sesión</Button></div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
