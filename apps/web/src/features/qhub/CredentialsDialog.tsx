import { useState } from 'react';
import { Button, Checkbox, Dialog, Notice, TextField } from '@/shared/ui';

/** Pide la cuenta de Qhub en una ventana (sin salir de la pantalla en la que está la persona). `onSubmit` devuelve el mensaje de error, o `null` si salió bien. */
export function CredentialsDialog({ title, intro, confirmLabel, rememberLabel, onSubmit, onCancel }: {
  title: string; intro: string; confirmLabel: string; rememberLabel?: string;
  onSubmit: (identifier: string, password: string, remember: boolean) => Promise<string | null>; onCancel: () => void;
}) {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!id.trim() || !pw) { setErr('Escribe tu correo o usuario de Qhub y la contraseña.'); return; }
    if (id.trim().length < 3 || id.trim().length > 254 || /\s/.test(id.trim())) { setErr('Revisa el usuario o correo de Qhub: sin espacios y con al menos 3 caracteres.'); return; }
    setBusy(true); setErr(null);
    const e = await onSubmit(id, pw, remember);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Dialog title={title} onClose={onCancel} actions={<><Button kind="ghost" onClick={onCancel}>Cancelar</Button><Button loading={busy} onClick={() => void submit()}>{confirmLabel}</Button></>}>
      <p className="text-text-secondary">{intro}</p>
      {err && <Notice kind="error" title={err} />}
      <TextField label="Correo o usuario de Qhub" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" />
      <TextField label="Contraseña" type="password" revealable value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} />
      {rememberLabel && <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} label={rememberLabel} />}
    </Dialog>
  );
}
