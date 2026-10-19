import { useState } from 'react';
import { Button, Icon, useToast } from '@/shared/ui';
import { useSession } from '@/app/container';
import { CredentialsDialog } from './CredentialsDialog';

/**
 * La conexión con Qhub ya se confirmó (lo registra la base de datos), así que no hay pantalla de conectar. Si en esta sesión
 * falta el token y no hay conexión guardada que lo renueve, se avisa aquí y se pide la cuenta en una ventana.
 */
export function ReconnectBanner() {
  const { session, connection } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const needed = !!session.membership?.organization.qhubConnected && connection.status === 'disconnected';
  if (!needed && !open) return null;       // la ventana sigue abierta mientras se conecta (el estado pasa por «conectando»)

  async function connect(identifier: string, password: string, remember: boolean): Promise<string | null> {
    const r = await session.connect(identifier, password, { remember });
    if (!r.ok) return r.failure.message;
    setOpen(false);
    toast.show('Conectado con Qhub.');
    session.onReconnected?.();               // las pantallas vuelven a pedir lo que no pudieron cargar
    return null;
  }

  return (
    <>
    {needed && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border border-border-subtle border-l-[3px] border-l-support-warning bg-layer-01 p-4 print:hidden">
      <span className="text-support-warning"><Icon name="warning" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Falta reconectar con Qhub</div>
        <div className="t-caption text-text-secondary">{(connection.status === 'disconnected' && connection.reason?.message) || 'Para cargar tus colas y turnos necesitamos volver a conectar tu cuenta de Qhub.'}</div>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>Reconectar</Button>
    </div>}
      {open && <CredentialsDialog title="Reconectar con Qhub" intro="Escribe tu cuenta de Qhub. Guardamos la conexión para que no te la volvamos a pedir." confirmLabel="Conectar"
        rememberLabel="Guardar la conexión (solo la escribes esta vez)" onSubmit={connect} onCancel={() => setOpen(false)} />}
    </>
  );
}
