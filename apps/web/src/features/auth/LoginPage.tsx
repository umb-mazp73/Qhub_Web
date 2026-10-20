import { useState, type FormEvent } from 'react';
import type { Failure } from '@qhub/core';
import { Button, Checkbox, cx, EmailField, Icon, Logo, Notice, StrengthMeter, TextField, GeneratePassword } from '@/shared/ui';
import { LoginShowcase } from './LoginShowcase';
import { useContainer, useSession } from '@/app/container';
import { CONFIRMED_KEY, REMOVED_KEY } from '@/features/session/app-session';
import { passwordStrength, validateEmail, validateOrgName, validatePassword, validatePersonName } from '@qhub/core';
import { LocationFields } from '@/features/geo/LocationFields';
import { ACCOUNT_KINDS, type AccountKind } from '@/features/staff';
import { clearInvitation, pendingInvitation, rememberInvitation } from '@/features/invitation/pending-invitation';

type Mode = 'login' | 'register' | 'forgot' | 'invite';
const TITLE: Record<Mode, string> = { login: 'Inicia sesión', register: 'Crea tu cuenta', forgot: 'Recupera tu acceso', invite: 'Únete con tu invitación' };
const REMEMBER_KEY = 'qhub.email';
const wasConfirmed = () => { try { const v = sessionStorage.getItem(CONFIRMED_KEY) === '1'; sessionStorage.removeItem(CONFIRMED_KEY); return v; } catch { return false; } };
const wasRemoved = () => { try { return sessionStorage.getItem(REMOVED_KEY) === '1'; } catch { return false; } };
const savedEmail = () => { try { return localStorage.getItem(REMEMBER_KEY) ?? ''; } catch { return ''; } };

export function LoginPage() {
  const { staff, security } = useContainer();
  const { session } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(savedEmail);
  const [remember, setRemember] = useState(() => savedEmail() !== '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [code, setCode] = useState(() => pendingInvitation() ?? '');
  const [kind, setKind] = useState<AccountKind>('empresa');
  const [orgName, setOrgName] = useState('');
  const [loc, setLoc] = useState({ country: 'Ecuador', city: '', timeZone: 'America/Guayaquil' });
  const withAccount = mode === 'register' && !pendingInvitation();     // quien viene por una invitación se une a un equipo: no crea cuenta nueva
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [info, setInfo] = useState<string | null>(() => (wasRemoved() ? 'Ya no tienes acceso a esa organización: un administrador te quitó del equipo.' : wasConfirmed() ? 'Correo confirmado: tu cuenta ya está creada. Inicia sesión con tu contraseña.' : null));

  function go(m: Mode) { try { sessionStorage.removeItem(REMOVED_KEY); } catch { /* sin storage */ } setMode(m); setErrs({}); setError(null); setInfo(null); setPassword(''); setAgain(''); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const register = mode === 'register';
    const next = {
      email: mode === 'invite' ? null : validateEmail(email),
      password: mode === 'forgot' || mode === 'invite' ? null : register ? validatePassword(password, { email }) : password ? null : 'Escribe tu contraseña.',
      again: register && again !== password ? 'Las contraseñas no coinciden.' : null,
      code: mode === 'invite' && !(rememberInvitation(code.trim()), pendingInvitation()) ? 'Pega el código de la invitación (viene en el correo).' : null,
      first: register ? validatePersonName(first, 'tu nombre') : null,
      last: register ? validatePersonName(last, 'tu apellido') : null,
      orgName: withAccount ? validateOrgName(orgName, kind === 'persona' ? 'tu cuenta (el nombre con el que te verá el público)' : 'la organización') : null,
      city: withAccount && !loc.city ? 'Elige la ciudad.' : null,
    };
    setErrs(next); setError(null); setInfo(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    if (mode === 'forgot') {
      const r = await security.requestPasswordReset(email);
      setBusy(false);
      if (!r.ok) setError(r.failure); else setInfo('Si el correo está registrado, te enviamos un enlace para elegir una contraseña nueva. Revisa también el spam. Si eres parte de un equipo, tu administrador debe aprobarlo primero: cuando lo haga, vuelve a pedir el enlace aquí.');
    } else if (mode === 'invite') {
      // Solo el código: el servidor valida y abre la sesión del correo invitado. Si no hay una contraseña que mostrarle, la acepta y entra; si la hay, la ve antes en la invitación.
      const r = await staff.signInWithInviteCode(code);
      if (!r.ok) { setBusy(false); setError(r.failure); return; }
      const pw = await staff.initialPassword(code);
      if (!(pw.ok && pw.value)) {
        const a = await staff.acceptInvitation(code);
        if (a.ok) { clearInvitation(); await session.loadMemberships(); } else setError(a.failure);
      }
      setBusy(false);
    } else if (register) {
      const account = withAccount ? { kind, name: orgName.trim(), country: loc.country, city: loc.city, timeZone: loc.timeZone } : undefined;
      // Con cuenta nueva no se crea NADA todavía (ni en la web ni en Qhub): se guarda el registro y se manda el correo; al confirmarlo se crean las dos.
      // Quien viene por una invitación se une a un equipo: ese sí usa el registro normal.
      const r = account ? await staff.requestRegistration({ email, password, firstName: first, lastName: last, account }) : await staff.signUp({ email, password, firstName: first, lastName: last });
      if (r.ok && account) { setBusy(false); go('login'); setInfo('Te enviamos un correo para confirmar tu cuenta. Cuando lo confirmes se crea todo y puedes iniciar sesión.'); return; }
      setBusy(false);
      if (!r.ok) setError(r.failure);
      else if (r.value === null) { go('login'); setInfo('Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.'); }
    } else {
      session.holdPassword(password);     // para crear/conectar la cuenta Qhub con el mismo correo y contraseña
      const r = await staff.signIn(email, password);
      if (!r.ok) session.holdPassword(null);
      setBusy(false);
      try { if (r.ok && remember) localStorage.setItem(REMEMBER_KEY, email.trim()); else if (r.ok) localStorage.removeItem(REMEMBER_KEY); } catch { /* sin storage */ }
      if (!r.ok) setError(r.failure);
    }
  }

  const link = (label: string, m: Mode) => <a href="#" onClick={(e) => { e.preventDefault(); go(m); }}>{label}</a>;

  return (
    <div className="grid min-h-full grid-cols-1 md:grid-cols-[3fr_minmax(440px,2fr)]">
      <main id="contenido" className="flex min-h-full flex-col bg-layer-01 px-6 py-8 sm:px-12 md:order-2 md:px-16">
        <Logo height={32} />
        <form className="my-auto flex w-full max-w-[460px] flex-col gap-4 py-10" onSubmit={(e) => void submit(e)} noValidate aria-label={TITLE[mode]}>
          <div>
            <h1 className="t-h1 mb-2">{TITLE[mode]}{mode === 'login' && <> en <span className="font-semibold">Qhub</span></>}</h1>
            <span className="text-text-secondary">
              {mode === 'login' && <>¿No tienes cuenta? {link('Crea una cuenta', 'register')}</>}
              {mode === 'register' && <>¿Ya tienes cuenta? {link('Inicia sesión', 'login')}</>}
              {mode === 'invite' && <>Pega el código que te llegó en el correo de la invitación. {link('Volver', 'login')}</>}
              {mode === 'forgot' && <>Te enviaremos un enlace por correo. {link('Volver', 'login')}</>}
            </span>
          </div>
          {error && <Notice kind="error" title={error.message} />}
          {error?.kind === 'conflict' && mode === 'register' && (
            <div className="-mt-2 flex flex-wrap gap-4">{link('Iniciar sesión con este correo', 'login')}{link('Recuperar mi contraseña', 'forgot')}</div>
          )}
          {info && <Notice kind="success" title={info} />}
          {mode === 'invite' && <TextField label="Código de invitación" value={code} onChange={(e) => setCode(e.target.value)} error={errs.code} autoComplete="off" large />}
          {mode === 'register' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TextField label="Nombre" value={first} onChange={(e) => setFirst(e.target.value)} error={errs.first} autoComplete="given-name" />
              <TextField label="Apellido" value={last} onChange={(e) => setLast(e.target.value)} error={errs.last} autoComplete="family-name" />
            </div>
          )}
          {mode !== 'invite' && <EmailField label="Correo de trabajo" value={email} onValueChange={(v) => { setEmail(v); setErrs((x) => ({ ...x, email: null })); }} error={errs.email} placeholder="nombre@ejemplo.com" large />}
          {mode !== 'forgot' && mode !== 'invite' && (
            <TextField label="Contraseña" type="password" revealable value={password} onChange={(e) => setPassword(e.target.value)} error={errs.password}
              helper={mode === 'register' ? 'Mínimo 8 caracteres, con letras y números.' : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} large />
          )}
          {mode === 'register' && (
            <>
              <TextField label="Repite la contraseña" type="password" revealable value={again} onChange={(e) => setAgain(e.target.value)} error={errs.again} autoComplete="new-password" large />
              <StrengthMeter score={passwordStrength(password)} empty={!password} />
              <GeneratePassword onGenerate={(p) => { setPassword(p); setAgain(p); }} />
            </>
          )}
          {withAccount && (
            <>
              <fieldset className="m-0 grid grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-2">
                <legend className="t-label mb-1 text-text-secondary">¿Cómo vas a usar Qhub?</legend>
                {ACCOUNT_KINDS.map((k) => (
                  <label key={k.value} className={cx('flex cursor-pointer flex-col gap-1 border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus', kind === k.value ? 'border-interactive bg-layer-02' : 'border-border-subtle bg-layer-01 hover:bg-layer-hover')}>
                    <input type="radio" name="tipo-cuenta" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="sr-only" />
                    <span className="flex items-center gap-2 font-medium"><Icon name={k.value === 'persona' ? 'user' : 'building'} />{k.label}{kind === k.value && <span className="ml-auto text-interactive"><Icon name="check" /></span>}</span>
                    <span className="t-caption text-text-secondary">{k.hint}</span>
                  </label>
                ))}
              </fieldset>
              <TextField label={kind === 'persona' ? 'Nombre con el que te verá el público' : 'Nombre de la organización'} value={orgName} onChange={(e) => setOrgName(e.target.value)} error={errs.orgName}
                helper={kind === 'persona' ? 'Por ejemplo, tu nombre o el de tu consultorio.' : undefined} />
              <LocationFields storeAs="name" value={loc} onChange={setLoc} errors={{ city: errs.city }} />
            </>
          )}
          <Button type="submit" size="lg" block icon="arrow-right" loading={busy}>{mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Continuar'}</Button>
          {mode !== 'login' && (
            <Button kind="tertiary" size="lg" block icon="chevron-left" onClick={() => go('login')}>Volver a iniciar sesión</Button>
          )}
          {mode === 'login' && (
            <>
              <div className="-mt-1">{link('¿Olvidaste tu contraseña?', 'forgot')}</div>
              <Checkbox label="Recordar mi correo" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <div className="t-caption my-2 flex items-center gap-3 text-text-secondary" aria-hidden><span className="h-px flex-1 bg-border-subtle" />o<span className="h-px flex-1 bg-border-subtle" /></div>
              <Button kind="tertiary" size="lg" block onClick={() => go('register')}>Crear una cuenta</Button>
              <Button kind="tertiary" size="lg" block onClick={() => go('invite')}>Tengo una invitación</Button>
            </>
          )}
        </form>
        <p className="t-caption m-0 flex items-start gap-2 text-text-secondary"><Icon name="info" />© Qhub 2026. Tu contraseña de Qhub nunca se guarda en este navegador.{mode === 'register' && ' Al crear tu cuenta aceptas los términos de Qhub.'}</p>
      </main>
      <LoginShowcase />
    </div>
  );
}
