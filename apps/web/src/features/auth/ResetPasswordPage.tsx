import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Failure } from '@qhub/core';
import { Button, Logo, Notice, Panel, StrengthMeter, TextField, GeneratePassword } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { passwordStrength, validatePassword } from '@qhub/core';

/** Llegada desde el enlace del correo de recuperación: la sesión ya viene en la URL; aquí se elige la contraseña nueva. */
export function ResetPasswordPage() {
  const { security } = useContainer();
  const { session } = useSession();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = { pw: validatePassword(pw, { email: session.user?.email }), again: again === pw ? null : 'Las contraseñas no coinciden.' };
    setErrs(next); setError(null);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true);
    const r = await security.setPassword(pw);
    setBusy(false);
    if (r.ok) nav('/', { replace: true }); else setError(r.failure);
  }

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(440px,100%)]">
        <Panel>
          <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate aria-label="Contraseña nueva">
            <Logo height={28} />
            <div><h1 className="t-h2">Elige tu contraseña nueva</h1><p className="text-text-secondary">Después entrarás con ella.</p></div>
            {error && <Notice kind="error" title={error.message} />}
            <TextField label="Contraseña nueva" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} error={errs.pw} autoComplete="new-password" helper="Mínimo 8 caracteres, con letras y números." large />
            <StrengthMeter score={passwordStrength(pw)} empty={!pw} />
            <GeneratePassword onGenerate={(p) => { setPw(p); setAgain(p); }} />
            <TextField label="Repite la contraseña" type="password" revealable value={again} onChange={(e) => setAgain(e.target.value)} error={errs.again} autoComplete="new-password" large />
            <Button type="submit" size="lg" block icon="check" loading={busy}>Guardar contraseña</Button>
          </form>
        </Panel>
      </div>
    </main>
  );
}
