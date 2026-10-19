import { useEffect, useState, type FormEvent } from 'react';
import type { Failure } from '@qhub/core';
import { Button, Icon, Logo, Notice, Panel, TextField } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { validateTotp } from '@/features/security/security';

/** Segundo paso del inicio de sesión: el código de 6 dígitos de la app autenticadora. */
export function MfaChallengePage() {
  const { security } = useContainer();
  const { session } = useSession();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void security.mfaFactors().then((r) => { if (live && r.ok) setFactorId(r.value.find((f) => f.verified)?.id ?? null); else if (live && !r.ok) setError(r.failure); });
    return () => { live = false; };
  }, [security]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = validateTotp(code);
    setErr(v); setError(null);
    if (v || !factorId) return;
    setBusy(true);
    const r = await security.mfaVerify(factorId, code);
    setBusy(false);
    if (r.ok) await session.completeMfa(); else setError(r.failure);
  }

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(440px,100%)]">
        <Panel>
          <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)} noValidate aria-label="Verificación en dos pasos">
            <Logo height={28} />
            <div>
              <h1 className="t-h2 flex items-center gap-2"><Icon name="info" size={24} />Verificación en dos pasos</h1>
              <p className="text-text-secondary">Abre tu app autenticadora y escribe el código de 6 dígitos de Qhub.</p>
            </div>
            {error && <Notice kind="error" title={error.message} />}
            <TextField label="Código de 6 dígitos" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }} error={err}
              inputMode="numeric" autoComplete="one-time-code" maxLength={6} large autoFocus />
            <Button type="submit" size="lg" block icon="arrow-right" loading={busy} disabled={!factorId}>Verificar</Button>
            <div><Button kind="ghost" size="sm" onClick={() => void session.signOut()}>Cerrar sesión</Button></div>
          </form>
        </Panel>
      </div>
    </main>
  );
}
