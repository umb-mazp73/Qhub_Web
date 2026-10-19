import { useState, type FormEvent } from 'react';
import type { Failure } from '@qhub/core';
import { Button, Checkbox, EmailField, Icon, Logo, Notice, StrengthMeter, TextField, GeneratePassword } from '@/shared/ui';
import { LoginShowcase } from './LoginShowcase';
import { useContainer } from '@/app/container';
import { passwordStrength, validateEmail, validatePassword, validatePersonName } from '@qhub/core';

type Mode = 'login' | 'register' | 'forgot';
const TITLE: Record<Mode, string> = { login: 'Inicia sesión', register: 'Crea tu cuenta', forgot: 'Recupera tu acceso' };
const REMEMBER_KEY = 'qhub.email';
const savedEmail = () => { try { return localStorage.getItem(REMEMBER_KEY) ?? ''; } catch { return ''; } };

export function LoginPage() {
  const { staff, security } = useContainer();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(savedEmail);
  const [remember, setRemember] = useState(() => savedEmail() !== '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function go(m: Mode) { setMode(m); setErrs({}); setError(null); setInfo(null); setPassword(''); setAgain(''); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const register = mode === 'register';
    const next = {
      email: validateEmail(email),
      password: mode === 'forgot' ? null : register ? validatePassword(password, { email }) : password ? null : 'Escribe tu contraseña.',
      again: register && again !== password ? 'Las contraseñas no coinciden.' : null,
      first: register ? validatePersonName(first, 'tu nombre') : null,
      last: register ? validatePersonName(last, 'tu apellido') : null,
    };
    setErrs(next); setError(null); setInfo(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    if (mode === 'forgot') {
      const r = await security.requestPasswordReset(email);
      setBusy(false);
      if (!r.ok) setError(r.failure); else setInfo('Si el correo está registrado, te enviamos un enlace para elegir una contraseña nueva. Revisa también el spam. Si eres parte de un equipo, tu administrador debe aprobarlo primero: cuando lo haga, vuelve a pedir el enlace aquí.');
    } else if (register) {
      const r = await staff.signUp({ email, password, firstName: first, lastName: last });
      setBusy(false);
      if (!r.ok) setError(r.failure);
      else if (r.value === null) { go('login'); setInfo('Te enviamos un correo para confirmar tu cuenta. Después inicia sesión.'); }
    } else {
      const r = await staff.signIn(email, password);
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
              {mode === 'forgot' && <>Te enviaremos un enlace por correo. {link('Volver', 'login')}</>}
            </span>
          </div>
          {error && <Notice kind="error" title={error.message} />}
          {error?.kind === 'conflict' && mode === 'register' && (
            <div className="-mt-2 flex flex-wrap gap-4">{link('Iniciar sesión con este correo', 'login')}{link('Recuperar mi contraseña', 'forgot')}</div>
          )}
          {info && <Notice kind="success" title={info} />}
          {mode === 'register' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <TextField label="Nombre" value={first} onChange={(e) => setFirst(e.target.value)} error={errs.first} autoComplete="given-name" />
              <TextField label="Apellido" value={last} onChange={(e) => setLast(e.target.value)} error={errs.last} autoComplete="family-name" />
            </div>
          )}
          <EmailField label="Correo de trabajo" value={email} onValueChange={(v) => { setEmail(v); setErrs((x) => ({ ...x, email: null })); }} error={errs.email} placeholder="nombre@ejemplo.com" large />
          {mode !== 'forgot' && (
            <TextField label="Contraseña" type="password" revealable value={password} onChange={(e) => setPassword(e.target.value)} error={errs.password}
              helper={mode === 'register' ? 'Mínimo 8 caracteres, con letras y números.' : undefined} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} large />
          )}
          {mode === 'register' && (
            <>
              <StrengthMeter score={passwordStrength(password)} empty={!password} />
              <GeneratePassword onGenerate={(p) => { setPassword(p); setAgain(p); }} />
              <TextField label="Repite la contraseña" type="password" revealable value={again} onChange={(e) => setAgain(e.target.value)} error={errs.again} autoComplete="new-password" large />
            </>
          )}
          <Button type="submit" size="lg" block icon="arrow-right" loading={busy}>{mode === 'register' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Continuar'}</Button>
          {mode === 'login' && (
            <>
              <div className="-mt-1">{link('¿Olvidaste tu contraseña?', 'forgot')}</div>
              <Checkbox label="Recordar mi correo" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <div className="t-caption my-2 flex items-center gap-3 text-text-secondary" aria-hidden><span className="h-px flex-1 bg-border-subtle" />o<span className="h-px flex-1 bg-border-subtle" /></div>
              <Button kind="tertiary" size="lg" block onClick={() => go('register')}>Crear una cuenta</Button>
            </>
          )}
        </form>
        <p className="t-caption m-0 flex items-start gap-2 text-text-secondary"><Icon name="info" />© Qhub 2026. Tu contraseña de Qhub nunca se guarda en este navegador.</p>
      </main>
      <LoginShowcase />
    </div>
  );
}
