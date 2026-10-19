import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Failure } from '@qhub/core';
import { passwordStrength, validatePassword } from '@qhub/core';
import { Button, GeneratePassword, Logo, Notice, Panel, StrengthMeter, TextField } from '@/shared/ui';
import { useContainer } from '@/app/container';

/** Elige la contraseña nueva de la cuenta de Qhub con el token del enlace del correo.
 * El destinatario llega anónimo (no hay sesión del panel): usa `auth` directo. */
export function QhubResetPasswordPage() {
  const { auth } = useContainer();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const badLink = (
    <Notice kind="error" title="El enlace no es válido o ya expiró"
      message="Solicita uno nuevo desde la pantalla de recuperación."
      action={<Link to="/qhub/recuperar">Pedir un enlace nuevo</Link>} />
  );

  if (!token) {
    return (
      <main id="contenido" className="grid min-h-full place-items-center p-6">
        <div className="w-[min(440px,100%)]"><Panel><div className="flex flex-col gap-4"><Logo height={28} />{badLink}</div></Panel></div>
      </main>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    // Fix #5: validar coincidencia y formato en el submit, SIN la opción { email } (anónimo),
    // antes de llamar a la API. Los errores de formato se muestran inline.
    const next = {
      pw: validatePassword(pw),
      again: again === pw ? null : 'Las contraseñas no coinciden.',
    };
    setErrs(next);
    setError(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    const r = await auth.resetPassword(token!, pw);
    setBusy(false);
    if (r.ok) setDone(true); else setError(r.failure);
  }

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(440px,100%)]">
        <Panel>
          {done ? (
            <div className="flex flex-col gap-4">
              <Logo height={28} />
              <Notice kind="success" title="Tu contraseña se actualizó. Ya puedes iniciar sesión con la nueva."
                action={<Link to="/login">Inicia sesión en el panel</Link>} />
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate aria-label="Contraseña nueva de Qhub">
              <Logo height={28} />
              <div><h1 className="t-h2">Elige tu contraseña nueva</h1><p className="text-text-secondary">Es la contraseña de tu cuenta de Qhub.</p></div>
              {error && badLink}
              <TextField label="Contraseña nueva" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} error={errs.pw} autoComplete="new-password" helper="Mínimo 8 caracteres, con letras y números." large />
              <StrengthMeter score={passwordStrength(pw)} empty={!pw} />
              <GeneratePassword onGenerate={(p) => { setPw(p); setAgain(p); }} />
              <TextField label="Repite la contraseña" type="password" revealable value={again} onChange={(e) => setAgain(e.target.value)} error={errs.again} autoComplete="new-password" large />
              <Button type="submit" size="lg" block icon="check" loading={busy}>Guardar contraseña</Button>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
