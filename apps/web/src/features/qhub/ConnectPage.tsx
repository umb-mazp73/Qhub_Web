import { useState } from 'react';
import { validateEmail, validatePassword, validatePersonName, validateUsername, type Failure } from '@qhub/core';
import type { RegisterInput } from '@qhub/api-client';
import { Button, Checkbox, EmailField, Logo, Notice, Panel, Tabs, TextField, useToast, GeneratePassword } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { can } from '@/features/staff';
import { LocationFields } from '@/features/geo/LocationFields';

/** Conecta la organización con su cuenta Qhub (API). La contraseña no se guarda en el navegador. */
export function ConnectPage() {
  const { auth } = useContainer();
  const { session, connection } = useSession();
  const org = session.membership?.organization.name ?? '';
  const personal = session.membership?.organization.kind === 'persona';
  const canSave = can(session.membership?.role, 'settings.manage');     // solo un administrador guarda la conexión en el servidor
  const [remember, setRemember] = useState(true);
  const toast = useToast();
  const warnIfNotSaved = (r: { ok: boolean; saved?: 'servidor' | 'dispositivo' | boolean; saveFailure?: Failure }) => {
    if (!r.ok || !remember) return;
    if (r.saved === 'dispositivo') toast.show('Guardamos la conexión en este dispositivo: no tendrás que volver a escribirla aquí.');
    else if (r.saved === false) toast.show('Conectaste, pero no pudimos guardar la conexión para la próxima vez. Inténtalo desde Ajustes.', { error: true });
  };
  const [tab, setTab] = useState(0);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [reg, setReg] = useState({ first: '', last: '', user: '', mail: '', country: 'Ecuador', city: '' });
  const [terms, setTerms] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const reason = connection.status === 'disconnected' ? connection.reason : undefined;

  async function connect() {
    const e: Record<string, string> = {};
    if (!id.trim()) e.id = 'Escribe tu correo o usuario de Qhub.';
    if (!pw) e.pw = 'Escribe la contraseña.';
    setErrs(e); setError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await session.connect(id, pw, { remember });
    setBusy(false);
    if (!r.ok) setError(r.failure); else warnIfNotSaved(r);
  }

  async function register() {
    const e: Record<string, string> = {};
    const fn = validatePersonName(reg.first, 'tu nombre'); if (fn) e.first = fn;
    const ln = validatePersonName(reg.last, 'tu apellido'); if (ln) e.last = ln;
    const un = validateUsername(reg.user); if (un) e.user = un;
    const em = validateEmail(reg.mail); if (em) e.mail = em;
    const pe = validatePassword(pw, { email: reg.mail }); if (pe) e.pw = pe;
    if (!reg.city.trim()) e.city = 'Elige la ciudad.';
    if (!terms) e.terms = 'Debes aceptar los términos.';
    setErrs(e); setError(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    const input: RegisterInput = { accountType: personal ? 'usuario' : 'empresa', ...(personal ? {} : { companyName: org }), firstName: reg.first.trim(), lastName: reg.last.trim(), username: reg.user.trim(), email: reg.mail.trim(), password: pw, country: reg.country.trim(), city: reg.city.trim(), acceptedTerms: terms };
    const r = await auth.register(input);
    if (!r.ok) { setBusy(false); setError(r.failure); return; }
    const login = await session.connect(reg.user, pw, { remember });
    setBusy(false);
    if (!login.ok) setError(login.failure); else warnIfNotSaved(login);
  }

  const set = (k: keyof typeof reg) => (ev: React.ChangeEvent<HTMLInputElement>) => setReg((s) => ({ ...s, [k]: ev.target.value }));

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(560px,100%)]">
        <Panel>
          <div className="flex flex-col gap-4">
            <Logo height={28} />
            <div><h1 className="t-h2">Conecta {org} con Qhub</h1><p className="text-text-secondary">{personal ? 'Usa tu cuenta Qhub personal para gestionar tus colas y turnos en vivo.' : 'Usa la cuenta Qhub de tu organización para gestionar colas y turnos en vivo.'}</p></div>
            <Tabs labels={['Ya tengo cuenta', 'Crear cuenta']} index={tab} onChange={(i) => { setTab(i); setError(null); setErrs({}); }} />
            {(error ?? reason) && <Notice kind="error" title={(error ?? reason)!.message} />}
            {!canSave && <Notice kind="info" title="Un administrador debe conectar la cuenta con Qhub." message="Cuando lo haga, entrarás directo sin escribir nada." />}
            <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} label="Guardar la conexión: solo lo haces una vez y la próxima vez entras directo" />
            {tab === 0 ? (
              <>
                <TextField label="Correo o usuario de Qhub" value={id} onChange={(e) => setId(e.target.value)} error={errs.id} />
                <TextField label="Contraseña" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} error={errs.pw} onKeyDown={(e) => { if (e.key === 'Enter') void connect(); }} />
                <Button size="lg" block icon="arrow-right" loading={busy} onClick={() => void connect()}>Conectar</Button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <div className="flex-1"><TextField label="Nombre" value={reg.first} onChange={set('first')} error={errs.first} /></div>
                  <div className="flex-1"><TextField label="Apellido" value={reg.last} onChange={set('last')} error={errs.last} /></div>
                </div>
                <TextField label="Usuario de Qhub" value={reg.user} onChange={set('user')} error={errs.user} />
                <EmailField label="Correo" value={reg.mail} onValueChange={(v) => setReg((r) => ({ ...r, mail: v }))} error={errs.mail} />
                <TextField label="Contraseña" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} error={errs.pw} helper="Mínimo 8 caracteres, con letras y números." />
                <GeneratePassword onGenerate={setPw} />
                <LocationFields storeAs="name" withTimeZone={false} value={{ country: reg.country, city: reg.city, timeZone: '' }} errors={{ city: errs.city }} onChange={(l) => setReg((r) => ({ ...r, country: l.country, city: l.city }))} />
                <div><Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} label="Acepto los términos y condiciones" />{errs.terms && <div className="t-caption text-support-error">{errs.terms}</div>}</div>
                <Button size="lg" block icon="arrow-right" loading={busy} onClick={() => void register()}>Crear cuenta y conectar</Button>
              </>
            )}
            <div><Button kind="ghost" size="sm" onClick={() => void session.signOut()}>Cerrar sesión</Button></div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
