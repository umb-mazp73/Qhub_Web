import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Failure } from '@qhub/core';
import { Button, Logo, Notice, Panel } from '@/shared/ui';
import { useContainer } from '@/app/container';
import { CONFIRMED_KEY } from '@/features/session/app-session';

/** Botón del correo de registro: aquí se crean las dos cuentas (web y Qhub). Después se va al inicio de sesión. */
export function ConfirmPage() {
  const { staff } = useContainer();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [error, setError] = useState<Failure | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    document.title = 'Confirmar correo · Qhub';
    if (ran.current) return;           // el enlace sirve una sola vez: no se manda dos veces
    ran.current = true;
    void (async () => {
      const r = await staff.confirmRegistration(token);
      if (!r.ok) { setError(r.failure); return; }
      try { sessionStorage.setItem(CONFIRMED_KEY, '1'); } catch { /* sin storage */ }
      nav('/login', { replace: true });
    })();
  }, [staff, token, nav]);

  return (
    <main id="contenido" className="grid min-h-full place-items-center p-6">
      <div className="w-[min(520px,100%)]">
        <Panel>
          <div className="flex flex-col gap-4">
            <Logo height={28} />
            {error ? (
              <>
                <h1 className="t-h2">No pudimos confirmar tu correo</h1>
                <Notice kind="error" title={error.message} />
                <Button kind="secondary" onClick={() => nav('/login', { replace: true })}>Ir a iniciar sesión</Button>
              </>
            ) : <div role="status"><h1 className="t-h2">Confirmando tu correo…</h1><p className="text-text-secondary">Estamos creando tu cuenta.</p></div>}
          </div>
        </Panel>
      </div>
    </main>
  );
}
