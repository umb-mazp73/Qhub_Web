import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { passwordStrength, timeAgo, unwrap, validateEmail, validatePassword } from '@qhub/core';
import { Button, ConfirmDialog, EmailField, Icon, Notice, Panel, Skeleton, StrengthMeter, TextField, useToast, GeneratePassword } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { activityLabel, describeBrowser, qrSrc, securityChecks, validateTotp, type MfaEnrollment } from '@/features/security/security';

const when = (d: Date | null) => (d ? `${d.toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short', hour12: false })} (${timeAgo(d)})` : '—');

export function SecurityTab() {
  const { staff, security } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const email = session.user?.email ?? '';
  const orgId = session.membership?.organization.id;
  const managed = !!session.membership && session.membership.organization.kind === 'empresa' && session.membership.role !== 'admin';
  const factors = useQuery({ queryKey: ['mfa-factors'], queryFn: async () => unwrap(await security.mfaFactors()) });
  const access = useQuery({ queryKey: ['access'], queryFn: async () => unwrap(await security.access()) });
  const profile = useQuery({ queryKey: ['profile'], queryFn: async () => unwrap(await staff.profile()) });
  const activity = useQuery({ queryKey: ['activity', orgId], enabled: !!orgId, queryFn: async () => unwrap(await security.activity(orgId!)) });
  const verified = (factors.data ?? []).find((f) => f.verified) ?? null;
  const { checks, score } = securityChecks({ emailConfirmed: access.data?.emailConfirmed ?? false, mfa: !!verified, phone: !!profile.data?.phone });

  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Nivel de seguridad · ${score} de ${checks.length}`}>
        {access.isLoading || factors.isLoading ? <Skeleton height={64} /> : (
          <>
            <div className="mb-3 flex gap-1" aria-hidden>{checks.map((c) => <span key={c.id} className={`h-1 flex-1 ${c.ok ? 'bg-state-done' : 'bg-skeleton-bg'}`} />)}</div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">{checks.map((c) => <li key={c.id} className="flex items-center gap-2"><span className={c.ok ? 'text-state-done-text' : 'text-state-waiting-text'}><Icon name={c.ok ? 'check' : 'warning'} /></span>{c.label}{!c.ok && <span className="t-caption text-text-secondary">· pendiente</span>}</li>)}</ul>
          </>
        )}
      </Panel>
      <MfaPanel verifiedId={verified?.id ?? null} loading={factors.isLoading} onChanged={() => { void qc.invalidateQueries({ queryKey: ['mfa-factors'] }); }} />
      <PasswordSection email={email} />
      {managed ? <EmailSection current={email} pending={access.data?.pendingEmail ?? null} onChanged={() => void qc.invalidateQueries({ queryKey: ['access'] })} /> : <EmailPanel current={email} pending={access.data?.pendingEmail ?? null} onChanged={() => void qc.invalidateQueries({ queryKey: ['access'] })} />}
      <Panel title="Sesiones y dispositivos">
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-text-secondary">Este navegador</dt><dd className="m-0">{describeBrowser(navigator.userAgent)}</dd>
            <dt className="text-text-secondary">Último acceso</dt><dd className="m-0">{when(access.data?.lastSignInAt ?? null)}</dd>
            <dt className="text-text-secondary">Cuenta creada</dt><dd className="m-0">{when(access.data?.createdAt ?? null)}</dd>
          </dl>
          <SessionButtons />
        </div>
      </Panel>
      {(activity.data ?? []).length > 0 && (
        <Panel title="Tu actividad reciente">
          <ul className="m-0 list-none p-0">{(activity.data ?? []).map((a) => <li key={a.id} className="flex min-h-control-md items-center gap-3 border-t border-border-subtle first:border-t-0"><span className="flex-1">{activityLabel(a.action)}</span><span className="t-caption text-text-secondary">{timeAgo(a.createdAt)}</span></li>)}</ul>
        </Panel>
      )}
    </div>
  );
}

function MfaPanel({ verifiedId, loading, onChanged }: { verifiedId: string | null; loading: boolean; onChanged: () => void }) {
  const { security } = useContainer();
  const toast = useToast();
  const [enroll, setEnroll] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  async function start() {
    setBusy(true);
    const r = await security.mfaEnroll('Qhub');
    setBusy(false);
    if (r.ok) { setEnroll(r.value); setCode(''); setErr(null); } else toast.show(r.failure.message, { error: true });
  }
  async function confirm() {
    const v = validateTotp(code);
    setErr(v);
    if (v || !enroll) return;
    setBusy(true);
    const r = await security.mfaConfirm(enroll.factorId, code);
    setBusy(false);
    if (r.ok) { setEnroll(null); toast.show('Verificación en dos pasos activada.'); onChanged(); } else setErr(r.failure.message);
  }
  async function turnOff() {
    setConfirmOff(false); setBusy(true);
    const r = await security.mfaRemove(verifiedId!);
    setBusy(false);
    if (r.ok) { toast.show('Desactivaste la verificación en dos pasos.'); onChanged(); } else toast.show(r.failure.message, { error: true });
  }

  return (
    <Panel title="Verificación en dos pasos" trailing={loading ? null : verifiedId ? <span className="inline-flex items-center gap-1 text-state-done-text"><Icon name="check" />Activada</span> : <span className="inline-flex items-center gap-1 text-state-waiting-text"><Icon name="warning" />No activada</span>}>
      {loading ? <Skeleton height={48} /> : enroll ? (
        <div className="flex flex-col gap-4">
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
            <li>Abre una app autenticadora (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
            <li>Escanea este código QR o escribe la clave a mano.</li>
            <li>Escribe aquí el código de 6 dígitos que muestra la app.</li>
          </ol>
          <div className="flex flex-wrap items-start gap-6">
            <img src={qrSrc(enroll.qrSvg)} alt="Código QR para tu app autenticadora" width={160} height={160} className="bg-text-on-color p-2 outline outline-1 outline-border-subtle" />
            <div className="flex min-w-0 flex-col gap-2"><span className="t-label text-text-secondary">Clave para escribir a mano</span><code className="t-code break-all bg-layer-02 p-2">{enroll.secret}</code>
              <Button kind="ghost" size="sm" onClick={async () => { await navigator.clipboard?.writeText(enroll.secret); toast.show('Clave copiada.'); }}>Copiar clave</Button></div>
          </div>
          <form className="flex max-w-[320px] flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void confirm(); }} noValidate aria-label="Confirmar verificación en dos pasos">
            <TextField label="Código de 6 dígitos" value={code} error={err} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null); }} />
            <div className="flex gap-2"><Button type="submit" icon="check" loading={busy}>Activar</Button><Button kind="ghost" onClick={() => setEnroll(null)}>Cancelar</Button></div>
          </form>
        </div>
      ) : verifiedId ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-text-secondary">Al iniciar sesión te pediremos el código de tu app autenticadora, además de la contraseña.</p>
          <Button kind="secondary" loading={busy} onClick={() => setConfirmOff(true)}>Desactivar</Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-text-secondary">Suma un segundo paso a tu acceso: aunque alguien tenga tu contraseña, no podrá entrar sin el código de tu celular.</p>
          <Button icon="arrow-right" loading={busy} onClick={() => void start()}>Activar verificación</Button>
        </div>
      )}
      {confirmOff && <ConfirmDialog title="Desactivar verificación en dos pasos" message="Tu cuenta quedará protegida solo por la contraseña. ¿Seguro?" confirmLabel="Desactivar" onCancel={() => setConfirmOff(false)} onConfirm={() => void turnOff()} />}
    </Panel>
  );
}

/** Cambiar el correo de acceso de un integrante del equipo exige el permiso de su administrador (igual que la contraseña). */
function EmailSection({ current, pending, onChanged }: { current: string; pending: string | null; onChanged: () => void }) {
  const { staff } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const orgId = session.membership!.organization.id;
  const perm = useQuery({ queryKey: ['my-permission', orgId, 'correo'], queryFn: async () => unwrap(await staff.myPermission(orgId, 'correo')) });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (perm.isLoading) return <Panel title="Correo de acceso"><Skeleton height={64} /></Panel>;
  const status = perm.data?.status;
  if (status === 'aprobada') return <div className="flex flex-col gap-4"><Notice kind="success" title="Tu administrador aprobó el cambio de correo." message="Tienes 24 horas y un solo cambio: confirma el enlace que te llegará al correo nuevo dentro de ese plazo." /><EmailPanel current={current} pending={pending} onChanged={onChanged} /></div>;
  async function ask() {
    setBusy(true);
    const r = await staff.requestChange(orgId, 'correo', reason.trim());
    setBusy(false);
    if (r.ok) { setReason(''); toast.show('Enviamos la solicitud a tu administrador.'); void perm.refetch(); } else toast.show(r.failure.message, { error: true });
  }
  return (
    <Panel title="Correo de acceso">
      <div className="flex max-w-[520px] flex-col gap-3">
        <p className="m-0 text-text-secondary">Tu correo es <strong className="font-medium text-text-primary">{current}</strong>. Lo gestiona tu administrador: para cambiarlo, envíale una solicitud y, cuando la apruebe, aquí aparecerá el formulario.</p>
        {status === 'pendiente' ? <Notice kind="info" title="Esperando la respuesta de tu administrador." message="Te avisaremos cuando la responda." /> : <>
          {status === 'rechazada' && <Notice kind="warning" title="Tu administrador no aprobó el cambio." />}
          <TextField label="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div><Button kind="secondary" loading={busy} onClick={() => void ask()}>Enviar solicitud para cambiar mi correo</Button></div>
        </>}
      </div>
    </Panel>
  );
}

/** Si el administrador asignó la contraseña, cambiarla exige su permiso: se pide, él lo aprueba y sirve para un cambio en 24 h. */
function PasswordSection({ email }: { email: string }) {
  const { staff } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const orgId = session.membership?.organization.id;
  const m = session.membership;
  const gated = !!m && m.organization.kind === 'empresa' && m.role !== 'admin';      // todo integrante de un equipo necesita el permiso de su administrador
  const perm = useQuery({ queryKey: ['my-permission', orgId, 'contrasena'], enabled: gated, queryFn: async () => unwrap(await staff.myPermission(orgId!, 'contrasena')) });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!gated) return <PasswordPanel email={email} />;
  if (perm.isLoading) return <Panel title="Contraseña"><Skeleton height={64} /></Panel>;
  const status = perm.data?.status;
  if (status === 'aprobada') return <PasswordPanel email={email} onChanged={() => { void staff.spendPasswordPermission(orgId!).then(() => perm.refetch()); }} lead={<Notice kind="success" title="Tu administrador aprobó el cambio." message="Tienes 24 horas y un solo cambio. Después tendrás que pedir permiso de nuevo." />} />;
  async function ask() {
    setBusy(true);
    const r = await staff.requestChange(orgId!, 'contrasena', reason.trim());
    setBusy(false);
    if (r.ok) { setReason(''); toast.show('Enviamos la solicitud a tu administrador.'); void perm.refetch(); } else toast.show(r.failure.message, { error: true });
  }
  return (
    <Panel title="Contraseña">
      <div className="flex max-w-[520px] flex-col gap-3">
        <p className="m-0 text-text-secondary">Tu contraseña la gestiona tu administrador. Para cambiarla, envíale una solicitud y, cuando la apruebe, aquí aparecerá el formulario.</p>
        {status === 'pendiente' ? <Notice kind="info" title="Esperando la respuesta de tu administrador." message="Te avisaremos cuando la responda." /> : <>
          {status === 'rechazada' && <Notice kind="warning" title="Tu administrador no aprobó el cambio." />}
          <TextField label="Motivo (opcional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <div><Button kind="secondary" loading={busy} onClick={() => void ask()}>Enviar solicitud para cambiar mi contraseña</Button></div>
        </>}
      </div>
    </Panel>
  );
}

function PasswordPanel({ email, onChanged, lead }: { email: string; onChanged?: () => void; lead?: React.ReactNode }) {
  const { security } = useContainer();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errs, setErrs] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  async function change() {
    const e = { cur: cur ? null : 'Escribe tu contraseña actual.', next: validatePassword(next, { email }) ?? (next === cur ? 'La nueva contraseña debe ser distinta de la actual.' : null), again: again === next ? null : 'Las contraseñas no coinciden.' };
    setErrs(e);
    if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    const r = await security.changePassword(email, cur, next);
    setBusy(false);
    if (r.ok) { setCur(''); setNext(''); setAgain(''); toast.show('Contraseña actualizada.'); onChanged?.(); }
    else if (r.failure.kind === 'unauthorized') setErrs({ cur: r.failure.message });
    else toast.show(r.failure.message, { error: true });
  }
  return (
    <Panel title="Contraseña">
      {lead && <div className="mb-4 max-w-[420px]">{lead}</div>}
      <form className="flex max-w-[420px] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void change(); }} noValidate aria-label="Cambiar contraseña">
        <TextField label="Contraseña actual" type="password" revealable value={cur} onChange={(e) => setCur(e.target.value)} error={errs.cur} autoComplete="current-password" />
        <TextField label="Contraseña nueva" type="password" revealable value={next} onChange={(e) => setNext(e.target.value)} error={errs.next} autoComplete="new-password" helper="Mínimo 8 caracteres, con letras y números." />
        <StrengthMeter score={passwordStrength(next)} empty={!next} />
        <GeneratePassword onGenerate={(p) => { setNext(p); setAgain(p); }} />
        <TextField label="Repite la contraseña nueva" type="password" revealable value={again} onChange={(e) => setAgain(e.target.value)} error={errs.again} autoComplete="new-password" />
        <div><Button type="submit" icon="check" loading={busy}>Cambiar contraseña</Button></div>
      </form>
    </Panel>
  );
}

function EmailPanel({ current, pending, onChanged }: { current: string; pending: string | null; onChanged: () => void }) {
  const { security } = useContainer();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    const v = validateEmail(value) ?? (value.trim().toLowerCase() === current.toLowerCase() ? 'Ese ya es tu correo.' : null);
    setErr(v);
    if (v) return;
    setBusy(true);
    const r = await security.changeEmail(value);
    setBusy(false);
    if (r.ok) { setValue(''); toast.show('Te enviamos un enlace de confirmación. El cambio se aplica al confirmarlo.'); onChanged(); } else toast.show(r.failure.message, { error: true });
  }
  return (
    <Panel title="Correo de acceso">
      <form className="flex max-w-[420px] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate aria-label="Cambiar correo">
        <TextField label="Correo actual" value={current} readOnly />
        {pending && <Notice kind="info" title={`Pendiente de confirmar: ${pending}`} message="Abre el enlace que te enviamos para terminar el cambio." />}
        <EmailField label="Correo nuevo" value={value} onValueChange={(v) => { setValue(v); setErr(null); }} error={err} helper="Te enviaremos un enlace para confirmarlo." />
        <div><Button type="submit" kind="secondary" loading={busy}>Cambiar correo</Button></div>
      </form>
    </Panel>
  );
}

function SessionButtons() {
  const { security } = useContainer();
  const { session } = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button kind="secondary" icon="logout" onClick={async () => { const r = await security.signOutOthers(); toast.show(r.ok ? 'Cerraste la sesión en tus otros dispositivos.' : r.failure.message, r.ok ? undefined : { error: true }); }}>Cerrar otras sesiones</Button>
      <Button kind="danger" icon="logout" onClick={() => setConfirm(true)}>Cerrar sesión en todos los dispositivos</Button>
      {confirm && <ConfirmDialog title="Cerrar sesión en todos los dispositivos" message="Se cerrará tu sesión aquí y en cualquier otro equipo. Tendrás que iniciar sesión de nuevo." confirmLabel="Cerrar todas"
        onCancel={() => setConfirm(false)} onConfirm={async () => { setConfirm(false); const r = await security.signOutEverywhere(); if (r.ok) session.disconnect(); else toast.show(r.failure.message, { error: true }); }} />}
    </div>
  );
}
