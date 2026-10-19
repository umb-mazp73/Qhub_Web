import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ALL_TIME_ZONES as TIME_ZONES, defaultQueuePrefix, type Failure, isValidQueuePrefix, type Result, suggestQueuePrefixes, trimSeconds } from '@qhub/core';
import { createQueue, isValidHm, normalizeHm, replaceSchedule, summarizeSchedule, validateSchedule, type ScheduleInput } from '@qhub/api-client';
import { Button, ConfirmDialog, cx, Notice, PageHead, Panel, Select, Skeleton, TextField, TimeField, useToast } from '@/shared/ui';
import { useContainer, useSession } from '@/app/container';
import { usePrefixes } from '@/features/queues/hooks';

const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const SLOTS = [10, 15, 20, 30, 45, 60, 90, 120];
const TURN_MINUTES = [5, 10, 15, 20, 25, 30, 45, 60, 90, 120];
const STATIONS = Array.from({ length: 20 }, (_, i) => i + 1);
const AHEAD_DAYS = [1, 2, 3, 5, 7, 14, 21, 30, 60, 90];
const DAILY_CAP = [0, 20, 50, 100, 150, 200, 300, 500, 1000];
/** Opciones numéricas; si el valor actual (de la API) no está en la lista, se agrega para no perderlo. */
const numOptions = (list: readonly number[], current: number, label: (n: number) => string) =>
  [...new Set([...list, current])].sort((a, b) => a - b).map((n) => ({ value: n, label: label(n) }));
const num = (s: string, d = 0) => { const n = Number.parseInt(s, 10); return Number.isNaN(n) ? d : n; };

/** Crea o edita una cola y su horario (solo admin). */
export function QueueEditPage() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { queues, staff } = useContainer();
  const { session } = useSession();
  const orgId = session.membership!.organization.id;

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [prefix, setPrefix] = useState('');
  /** Mientras la persona no toque el prefijo, sigue al nombre de la cola; al editarlo (o al editar una cola existente) deja de seguirlo. */
  const [prefixTouched, setPrefixTouched] = useState(editing);
  const known = usePrefixes().data ?? {};
  const [opens, setOpens] = useState('08:00');
  const [closes, setCloses] = useState('17:00');
  const [turn, setTurn] = useState('10');
  const [stations, setStations] = useState('1');
  const [daily, setDaily] = useState('0');
  const [ahead, setAhead] = useState('7');
  const [slot, setSlot] = useState(30);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [zone, setZone] = useState(session.membership!.organization.timeZone);
  const [active, setActive] = useState(true);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const touch = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };
  const taken = useMemo(() => Object.entries(known).filter(([qid]) => qid !== id).map(([, p]) => p), [known, id]);
  const suggestions = useMemo(() => suggestQueuePrefixes(name, taken, 4), [name, taken]);
  const usedBy = (p: string) => (p ? Object.entries(known).find(([qid, v]) => qid !== id && v === p.toUpperCase())?.[0] : undefined);
  const changeName = (v: string) => { touch(setName)(v); if (!prefixTouched) setPrefix(suggestQueuePrefixes(v, taken, 1)[0] ?? ''); };
  const changePrefix = (v: string) => { setPrefixTouched(true); touch(setPrefix)(v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2)); };

  useEffect(() => {
    if (!id) return;
    let live = true;
    void (async () => {
      const [q, s, p] = await Promise.all([queues.get(id), queues.schedule(id), staff.queuePrefixes(orgId)]);
      if (!live) return;
      if (q.ok) { setName(q.value.name); setDesc(q.value.description ?? ''); setActive(q.value.active); setLoadedName(q.value.name); setPrefix((p.ok ? p.value[id] : undefined) ?? defaultQueuePrefix(q.value.name)); } else setError(q.failure);
      if (s.ok) {
        const v = s.value;
        setOpens(trimSeconds(v.opens)); setCloses(trimSeconds(v.closes)); setSlot(SLOTS.includes(v.slotMinutes) ? v.slotMinutes : 30); setDays([...v.days]);
        setTurn(String(v.turnMinutes)); setStations(String(v.stations)); setDaily(String(v.dailyCapacity)); setAhead(String(v.maxDaysAhead));
        setZone(v.timeZone);
      } else setError((e) => e ?? s.failure);
      setLoading(false); setDirty(false);
    })();
    return () => { live = false; };
  }, [id, queues, staff, orgId]);

  const input = useMemo<ScheduleInput | null>(() => (isValidHm(opens) && isValidHm(closes)
    ? { opens: normalizeHm(opens), closes: normalizeHm(closes), slotMinutes: slot, days: [...days].sort(), turnMinutes: num(turn, 1), stations: num(stations, 1), dailyCapacity: num(daily), maxDaysAhead: num(ahead), timeZone: zone }
    : null), [opens, closes, slot, days, turn, stations, daily, ahead, zone]);
  const summary = input ? summarizeSchedule(input) : null;
  const prefixValue = prefix.trim() || defaultQueuePrefix(name);

  async function save() {
    setError(null);
    const e: Record<string, string> = {};
    { const n = name.trim(); if (n.length < 2) e.name = 'Escribe el nombre de la cola (mínimo 2 caracteres).'; else if (n.length > 80) e.name = 'Usa 80 caracteres como máximo.'; else if (/[<>\u0000-\u001f]/.test(n)) e.name = 'El nombre no puede llevar símbolos como < o >.'; }
    if (prefix.trim() && !isValidQueuePrefix(prefix.trim().toUpperCase())) e.prefix = '1 o 2 letras (A–Z).';
    if (!isValidHm(opens)) e.opens = 'Elige la hora de apertura.';
    if (!isValidHm(closes)) e.closes = 'Elige la hora de cierre.';
    if (input) { const m = validateSchedule(input); if (m) e.schedule = m; }
    setErrs(e);
    if (Object.keys(e).length || !input) return;

    setSaving(true);
    let res: Result<string>;
    if (id) {
      const patch = await queues.update(id, { name: name.trim(), description: desc.trim() });
      if (!patch.ok) res = patch;
      else { const sch = await replaceSchedule(queues, id, input); res = sch.ok ? { ok: true, value: id } : sch; }
    } else {
      const c = await createQueue(queues, { name, description: desc, schedule: input });
      res = c.ok ? { ok: true, value: c.value.id } : c;
    }
    if (!res.ok) { setSaving(false); setError(res.failure); return; }
    await staff.setQueuePrefix(orgId, res.value, prefixValue);
    await staff.audit(orgId, id ? 'cola.editar' : 'cola.crear', { entity: 'cola', entityId: res.value, detail: { nombre: name.trim() } });
    await Promise.all(['queues', 'queue-limit', 'prefixes'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    toast.show(id ? 'Cola actualizada.' : 'Cola creada.');
    nav('/colas');
  }

  async function archive() {
    setConfirmDelete(false); setSaving(true);
    const r = await queues.delete(id!);
    if (!r.ok) { setSaving(false); setError(r.failure); return; }
    await staff.audit(orgId, 'cola.archivar', { entity: 'cola', entityId: id });
    await Promise.all(['queues', 'queue-limit'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    toast.show('Cola archivada.');
    nav('/colas');
  }

  async function reactivate() {
    setSaving(true);
    const r = await queues.update(id!, { active: true });
    if (!r.ok) { setSaving(false); setError(r.failure); return; }
    await Promise.all(['queues', 'queue-limit'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    toast.show('Cola reactivada.');
    nav('/colas');
  }

  return (
    <div>
      <PageHead title={editing ? 'Editar cola' : 'Crear cola'} breadcrumb={`Colas${loadedName ? ` / ${loadedName}` : ''}`} actions={<>
        {dirty && <span className="t-caption text-text-secondary">Cambios sin guardar</span>}
        <Button kind="ghost" onClick={() => nav('/colas')}>Cancelar</Button>
        <Button icon="check" loading={saving} disabled={loading || !active} onClick={() => void save()}>Guardar cola</Button>
      </>} />
      <div className="flex flex-col gap-4">
        {error && <Notice kind="error" title={error.message} />}
        {errs.schedule && <Notice kind="warning" title={errs.schedule} />}
        {editing && !active && <Notice kind="info" title="Esta cola está archivada." message="Reactívala para volver a editarla y recibir turnos." />}
        {loading ? <Skeleton height={320} /> : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-col gap-4">
              <Panel title="Información">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[3fr_1fr]">
                    <TextField label="Nombre de la cola" value={name} onChange={(e) => changeName(e.target.value)} error={errs.name} />
                    <TextField label="Prefijo del turno" value={prefix} maxLength={2} autoComplete="off" onChange={(e) => changePrefix(e.target.value)} error={errs.prefix}
                      helper={usedBy(prefixValue) ? 'Ya lo usa otra cola: los turnos se podrían confundir.' : `Turnos ${prefixValue.toUpperCase()}-001…`} />
                  </div>
                  {name.trim() && suggestions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Prefijos sugeridos">
                      <span className="t-caption text-text-secondary">Sugerencias según el nombre:</span>
                      {suggestions.map((s) => <button key={s} type="button" aria-pressed={prefix.toUpperCase() === s} onClick={() => changePrefix(s)}
                        className={cx('t-turn min-h-control-sm cursor-pointer border-0 px-3', prefix.toUpperCase() === s ? 'bg-interactive text-text-on-color' : 'bg-field text-text-primary hover:bg-layer-hover')}>{s}</button>)}
                      <span className="t-caption text-text-secondary">o escribe el tuyo.</span>
                    </div>
                  )}
                  <TextField label="Descripción (opcional)" value={desc} onChange={(e) => touch(setDesc)(e.target.value)} />
                </div>
              </Panel>
              <Panel title="Horario">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1"><span className="t-label text-text-secondary">Días de atención</span>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Días de atención">
                      {LETTERS.map((l, i) => <button key={l} type="button" aria-label={`Día ${l}`} aria-pressed={days.includes(i + 1)} onClick={() => touch(setDays)(days.includes(i + 1) ? days.filter((d) => d !== i + 1) : [...days, i + 1])} className={cx('size-10 cursor-pointer border-0 border-b font-semibold', days.includes(i + 1) ? 'border-b-transparent bg-interactive text-text-on-color' : 'border-b-border-strong bg-field')}>{l}</button>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 items-start gap-4">
                    <TimeField label="Apertura" value={opens} onValueChange={touch(setOpens)} error={errs.opens} />
                    <TimeField label="Cierre" value={closes} onValueChange={touch(setCloses)} error={errs.closes} />
                    <div className="col-span-2"><Select label="Zona horaria" value={zone} options={TIME_ZONES.some((z) => z.value === zone) ? TIME_ZONES : [{ value: zone, label: zone }, ...TIME_ZONES]} onValueChange={touch(setZone)} /></div>
                  </div>
                </div>
              </Panel>
              <Panel title="Franjas y cupos">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                    <Select label="Duración de franja" value={slot} options={SLOTS.map((m) => ({ value: m, label: `${m} minutos` }))} onValueChange={touch(setSlot)} />
                    <Select label="Duración del trámite" value={num(turn, 10)} options={numOptions(TURN_MINUTES, num(turn, 10), (n) => `${n} minutos`)} onValueChange={(n) => touch(setTurn)(String(n))} />
                    <Select label="Puestos en paralelo" value={num(stations, 1)} options={numOptions(STATIONS, num(stations, 1), (n) => (n === 1 ? '1 puesto' : `${n} puestos`))} onValueChange={(n) => touch(setStations)(String(n))} />
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                    <Select label="Reservar con anticipación" value={num(ahead, 7)} options={numOptions(AHEAD_DAYS, num(ahead, 7), (n) => (n === 1 ? 'Hasta 1 día antes' : `Hasta ${n} días antes`))} onValueChange={(n) => touch(setAhead)(String(n))} />
                    <Select label="Tope diario de turnos" value={num(daily)} options={numOptions(DAILY_CAP, num(daily), (n) => (n === 0 ? 'Sin tope' : `${n} turnos`))} onValueChange={(n) => touch(setDaily)(String(n))} />
                  </div>
                </div>
              </Panel>
            </div>
            <div className="flex flex-col gap-4">
              <Panel title="Resumen">
                {[['Franjas por día', summary?.slotsPerDay], ['Cupos por franja', summary?.capacityPerSlot], ['Turnos por día', summary?.turnsPerDay], ['Turnos por semana', summary?.turnsPerWeek]].map(([k, v]) => (
                  <div key={String(k)} className="flex items-center justify-between gap-2 py-1.5"><span className="text-text-secondary">{k}</span><span className="font-mono">{v ?? '—'}</span></div>
                ))}
                <p className="t-caption mt-3 text-text-secondary">Los cupos se calculan: franja ÷ trámite × puestos.</p>
              </Panel>
              {editing && (
                <Panel title={active ? 'Zona de peligro' : 'Cola archivada'}>
                  {active ? <Button kind="danger" icon="trash" disabled={saving} onClick={() => setConfirmDelete(true)}>Eliminar cola</Button> : <Button icon="play" disabled={saving} onClick={() => void reactivate()}>Reactivar cola</Button>}
                </Panel>
              )}
            </div>
          </div>
        )}
      </div>
      {confirmDelete && <ConfirmDialog title="Eliminar cola" message={`Se archiva "${loadedName ?? name}": libera un lugar y su nombre, y se conserva el historial de turnos.`} confirmLabel="Eliminar cola" onConfirm={() => void archive()} onCancel={() => setConfirmDelete(false)} />}
    </div>
  );
}
