import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon, useToast } from '@/shared/ui';
import { useSession } from '@/app/container';
import { can } from '@/features/staff';
import { CredentialsDialog } from './CredentialsDialog';

/**
 * La conexión con Qhub ya se confirmó (lo registra la base de datos), así que no hay pantalla de conectar. Si en esta sesión
 * falta el token y no hay conexión guardada que lo renueve, se avisa aquí. El administrador vuelve a escribir su cuenta de Qhub;
 * los demás integrantes no conocen esa contraseña, así que se reconecta sola con la conexión guardada en el servidor y, si no
 * se puede, se avisa a los administradores para que ellos reconecten.
 */
export function ReconnectBanner() {
  const { session, connection } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = can(session.membership?.role, 'settings.manage');
  const needed = !!session.membership?.organization.qhubConnected && connection.status === 'disconnected';
  // administrador conectado solo en este dispositivo: la conexión no está en el servidor y los demás integrantes no pueden conectarse
  const unsaved = isAdmin && !!session.membership?.organization.qhubConnected && !session.membership.organization.linked && connection.status === 'connected';
  if (!needed && !unsaved && !open) return null;       // la ventana sigue abierta mientras se conecta (el estado pasa por «conectando»)

  // administrador: igual que antes (ventana de credenciales -> session.connect(...))
  async function connect(identifier: string, password: string, remember: boolean): Promise<string | null> {
    const r = await session.connect(identifier, password, { remember });
    if (!r.ok) return r.failure.message;
    setOpen(false);
    if (r.saved === 'servidor') toast.show('Conectado con Qhub. La conexión quedó guardada en el servidor para todo el equipo.');
    else toast.show('Conectaste, pero la conexión NO quedó guardada en el servidor: el resto del equipo no podrá conectarse. Inténtalo de nuevo en unos minutos.', { error: true });
    session.onReconnected?.();               // las pantallas vuelven a pedir lo que no pudieron cargar
    return null;
  }

  // integrante que no es admin: reconexión automática por servidor + aviso al admin si falla (sin pedir credenciales)
  async function onReconnect() {
    if (isAdmin) { setOpen(true); return; }
    setBusy(true);
    const r = await session.autoReconnectOrNotify();
    setBusy(false);
    toast.show(r === 'ok' ? 'Conectado con Qhub.' : 'Le avisamos a tu administrador para que reconecte la cuenta de Qhub.');
  }

  return (
    <>
    {unsaved && !open && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border border-border-subtle border-l-[3px] border-l-support-warning bg-layer-01 p-4 print:hidden">
      <span className="text-support-warning"><Icon name="warning" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">La conexión con Qhub no está guardada en el servidor</div>
        <div className="t-caption text-text-secondary">Solo funciona en este dispositivo. Guárdala para que el resto del equipo y tus otros dispositivos se conecten solos.</div>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>Guardar conexión</Button>
    </div>}
    {needed && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 border border-border-subtle border-l-[3px] border-l-support-warning bg-layer-01 p-4 print:hidden">
      <span className="text-support-warning"><Icon name="warning" /></span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">Falta reconectar con Qhub</div>
        <div className="t-caption text-text-secondary">{(connection.status === 'disconnected' && connection.reason?.message) || 'Para cargar tus colas y turnos necesitamos volver a conectar tu cuenta de Qhub.'}</div>
      </div>
      <Button size="sm" loading={busy} onClick={() => void onReconnect()}>Reconectar</Button>
    </div>}
      {open && isAdmin && <CredentialsDialog title="Reconectar con Qhub" intro="Escribe tu cuenta de Qhub. Guardamos la conexión para que no te la volvamos a pedir." confirmLabel="Conectar"
        rememberLabel="Guardar la conexión (solo la escribes esta vez)" onSubmit={connect} onCancel={() => setOpen(false)}
        onForgot={() => navigate('/qhub/recuperar')} onRegister={() => navigate('/connect?tab=crear')} />}
    </>
  );
}
