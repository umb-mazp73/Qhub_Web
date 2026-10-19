import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Failure } from '@qhub/core';
import { validateEmail } from '@qhub/core';
import { Button, EmailField, Logo, Notice, Panel } from '@/shared/ui';
import { useContainer } from '@/app/container';

/** Pide el enlace para restablecer la contraseña de la cuenta de Qhub. El destinatario llega
 * anónimo (no hay sesión del panel); por eso usa `auth` directo y no `useSession()`. */
export function QhubRequestResetPage() {
  const { auth } = useContainer();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validateEmail(email);
    setFieldErr(err);
    setError(null);
    if (err) return;                    // formato inválido: no se llama a la API
    setBusy(true);
    const r = await auth.requestPasswordReset(email.trim());
    setBusy(false);
    if (r.ok) setSent(true); else setError(r.failure);
  }

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(440px,100%)]">
        <Panel>
          {sent ? (
            <div className="flex flex-col gap-4">
              <Logo height={28} />
              <Notice kind="success" title="Revisa tu correo"
                message="Si el correo está registrado en Qhub, te enviamos un enlace para elegir una contraseña nueva. Revisa también el spam." />
              <Button kind="tertiary" size="lg" block icon="chevron-left" onClick={() => navigate(-1)}>Volver</Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate aria-label="Recuperar contraseña">
              <Logo height={28} />
              <div>
                <h1 className="t-h2">¿Olvidaste tu contraseña?</h1>
                <p className="text-text-secondary">Escribe el correo de tu cuenta de Qhub y te enviaremos un enlace para elegir una nueva.</p>
              </div>
              {error && <Notice kind="error" title={error.message} />}
              <EmailField label="Correo de tu cuenta de Qhub" value={email} onValueChange={setEmail} error={fieldErr} autoComplete="email" large />
              <Button type="submit" size="lg" block icon="arrow-right" loading={busy}>Enviar enlace</Button>
              <Button kind="tertiary" size="lg" block icon="chevron-left" onClick={() => navigate(-1)}>Volver</Button>
            </form>
          )}
        </Panel>
      </div>
    </main>
  );
}
