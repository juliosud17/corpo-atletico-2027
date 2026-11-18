import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, Field, Page, Select, TextInput, cx } from '../../components/ui';
import { useProfile, useSave } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteSet, deleteWorkoutSession, finishLiveSession, patchSession, saveSet } from '../../data/repo';
import { fmt, parseDecimal } from '../../domain/calculations';
import { formatBR } from '../../domain/dates';
import { elapsedMs, exerciseHistory, formatClock, normalizeName, pauseTimer, progressionSuggestion, resumeTimer } from '../../domain/workouts';
import type { ExercisePrescription, ExerciseSet, WorkoutSession } from '../../domain/types';
import { EmergencyAlert } from '../recovery/RecoverySheet';

function Clock({ session }: { session: WorkoutSession }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!session.timerRunningSince) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session.timerRunningSince]);
  return <span className="num">{formatClock(elapsedMs(session, now))}</span>;
}

export function ProgressionBadge({ kind, reason }: { kind: string; reason: string }) {
  const map: Record<string, string> = { increase: 'bg-accent-soft text-accent', hold: 'bg-card2 text-muted', pain: 'bg-warn-soft text-warn', insufficient: 'bg-card2 text-muted' };
  const icon: Record<string, string> = { increase: '↑', hold: '=', pain: '⚠', insufficient: '…' };
  return <p className={cx('rounded-lg px-2 py-1 text-xs', map[kind])}><span aria-hidden>{icon[kind]} </span>{reason}</p>;
}

function ExerciseBlock({ name, prescription, sessionId, sets, allSets, sessions }: {
  name: string; prescription?: ExercisePrescription; sessionId: string; sets: ExerciseSet[]; allSets: ExerciseSet[]; sessions: WorkoutSession[];
}) {
  const save = useSave();
  const history = useMemo(() => exerciseHistory(name, allSets.filter((s) => s.sessionId !== sessionId), sessions), [name, allSets, sessionId, sessions]);
  const last = history[history.length - 1];
  const lastLoad = [...allSets].filter((s) => s.sessionId !== sessionId && normalizeName(s.exerciseName) === normalizeName(name) && s.loadKg !== undefined)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]?.loadKg;
  const mine = [...sets].sort((a, b) => a.order - b.order);
  const prevInSession = mine[mine.length - 1];
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [rpe, setRpe] = useState('');
  const [pain, setPain] = useState(false);
  const prog = progressionSuggestion(history, prescription ?? {});
  const target = prescription?.targetSets ? `${prescription.targetSets} × ${prescription.targetReps ?? '—'}` : null;
  const done = prescription?.targetSets ? mine.length >= prescription.targetSets : false;

  async function addSet() {
    const r = parseDecimal(reps) ?? prevInSession?.reps ?? prescription?.targetReps;
    const l = load.trim() ? parseDecimal(load) ?? undefined : prevInSession?.loadKg ?? lastLoad;
    const e = rpe ? Number(rpe) : undefined;
    if (r === undefined || r === null || r < 0) return;
    await save(() => saveSet({ sessionId, exerciseName: name, order: mine.length, reps: r, loadKg: l, rpe: e, pain: pain || undefined }), `Série ${mine.length + 1} registrada`);
    setReps(''); setLoad(''); setRpe(''); setPain(false);
  }

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{done && <span aria-label="séries-alvo concluídas">✔ </span>}{name}</h3>
          <p className="text-xs text-muted">
            {target ? `Alvo: ${target}` : 'Exercício avulso'}{prescription?.notes ? ` · ${prescription.notes}` : ''}
            {last && ` · Última vez (${formatBR(last.date)}): ${last.repsPerSet.join('/')} reps${last.maxLoadKg !== null ? ` @ até ${fmt(last.maxLoadKg)} kg` : ''}`}
          </p>
        </div>
      </div>
      {history.length > 0 && <ProgressionBadge kind={prog.kind} reason={prog.reason} />}
      {mine.length > 0 && (
        <ol className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
          {mine.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="num">Série {i + 1}: <b>{s.reps ?? '—'}</b> reps{s.loadKg !== undefined && <> · <b>{fmt(s.loadKg)}</b> kg</>}{s.rpe !== undefined && <span className="text-muted"> · RPE {s.rpe}</span>}{s.pain && <span className="text-warn"> · dor</span>}</span>
              <button type="button" className="min-h-9 px-2 text-danger" aria-label={`Excluir série ${i + 1} de ${name}`} onClick={() => save(() => deleteSet(s.id), 'Série excluída')}>✕</button>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Reps">{(id) => <TextInput id={id} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder={String(prevInSession?.reps ?? prescription?.targetReps ?? '')} />}</Field>
        <Field label="Carga (kg)">{(id) => <TextInput id={id} inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} placeholder={(prevInSession?.loadKg ?? lastLoad) !== undefined ? fmt(prevInSession?.loadKg ?? lastLoad) : '—'} />}</Field>
        <Field label="RPE">{(id) => (
          <Select id={id} value={rpe} onChange={(e) => setRpe(e.target.value)}>
            <option value="">—</option>
            {[5, 6, 7, 8, 9, 10].map((v) => <option key={v} value={v}>{v}{v === 7 || v === 8 ? ' (2–3 sobrando)' : v === 10 ? ' (falha)' : ''}</option>)}
          </Select>
        )}</Field>
      </div>
      <label className="mt-2 flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5 accent-[var(--warn)]" checked={pain} onChange={(e) => setPain(e.target.checked)} />
        Senti dor ou desconforto nesta série
      </label>
      {pain && <Alert tone="warn">Interrompa o movimento se a dor for aguda ou piorar. Anote o que sentiu e procure orientação se persistir.</Alert>}
      <Button variant="secondary" className="mt-2 w-full" onClick={addSet}>+ Série {mine.length + 1}</Button>
    </Card>
  );
}

export function LiveSession() {
  const navigate = useNavigate();
  const save = useSave();
  const profile = useProfile();
  const session = useLiveQuery(() => db.workouts.filter((w) => !!w.inProgress).first().then((s) => s ?? null), []);
  const plan = useLiveQuery(() => (session?.planId ? db.workoutPlans.get(session.planId) : undefined), [session?.planId]);
  const prescriptions = useLiveQuery(() => (session?.planId ? db.exercises.where('workoutPlanId').equals(session.planId).sortBy('order') : []), [session?.planId], [] as ExercisePrescription[]);
  const sets = useLiveQuery(() => (session ? db.exerciseSets.where('sessionId').equals(session.id).toArray() : []), [session?.id], [] as ExerciseSet[]);
  const allSets = useLiveQuery(() => db.exerciseSets.toArray(), [], [] as ExerciseSet[]);
  const sessions = useLiveQuery(() => db.workouts.toArray(), [], [] as WorkoutSession[]);
  const library = useLiveQuery(async () => {
    const names = new Set<string>();
    (await db.exercises.toArray()).forEach((e) => names.add(e.name));
    (await db.exerciseSets.toArray()).forEach((e) => names.add(e.exerciseName));
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [], [] as string[]);
  const [extra, setExtra] = useState('');
  // Exercícios avulsos adicionados nesta tela (passam a ser salvos ao registrar a 1ª série).
  const [added, setAdded] = useState<string[]>([]);
  const [finish, setFinish] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [cardioMin, setCardioMin] = useState<string | null>(null);

  if (session === undefined) return <p className="p-6 text-muted" role="status">Carregando…</p>;
  if (session === null) return <Navigate to="/treinos" replace />;

  const names = prescriptions.map((p) => p.name);
  const extraNames: string[] = [];
  for (const n of [...sets.map((s) => s.exerciseName), ...added]) {
    if (!names.some((p) => normalizeName(p) === normalizeName(n)) && !extraNames.some((e) => normalizeName(e) === normalizeName(n))) extraNames.push(n);
  }
  const running = !!session.timerRunningSince;
  const isCardio = plan?.type === 'cardio' || plan?.type === 'mobility';

  return (
    <Page title={plan?.name ?? 'Treino avulso'} subtitle={`Sessão em andamento · ${formatBR(session.date)}`}>
      {session.confirmedWithoutClearance && <Alert tone="warn" title="Registrada sem liberação confirmada">Evite impacto, corrida e cargas altas. Interrompa qualquer movimento que cause dor.</Alert>}
      {!session.confirmedWithoutClearance && profile?.healthNotes && <Alert tone="info">Lembrete: {profile.healthNotes}. Siga as adaptações recebidas.</Alert>}
      {plan?.safetyNote && <p className="text-sm text-warn">⚠ {plan.safetyNote}</p>}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">{running ? 'Cronômetro' : 'Pausado'}</p>
            <p className={cx('text-4xl font-extrabold', !running && 'text-muted')}><Clock session={session} /></p>
          </div>
          <Button variant={running ? 'secondary' : 'primary'} className="min-w-28"
            onClick={() => save(() => patchSession(session.id, running ? pauseTimer(session) : resumeTimer(session)))}>
            {running ? '⏸ Pausar' : '▶ Retomar'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">Cargas leves a moderadas, deixando 2–3 repetições “sobrando” (RPE 7–8). Sem buscar falha.</p>
      </Card>

      {prescriptions.map((p) => (
        <ExerciseBlock key={p.id} name={p.name} prescription={p} sessionId={session.id} sets={sets.filter((s) => normalizeName(s.exerciseName) === normalizeName(p.name))} allSets={allSets} sessions={sessions} />
      ))}
      {extraNames.map((n) => (
        <ExerciseBlock key={n} name={n} sessionId={session.id} sets={sets.filter((s) => normalizeName(s.exerciseName) === normalizeName(n))} allSets={allSets} sessions={sessions} />
      ))}

      <Card title="Adicionar exercício">
        <div className="flex items-end gap-2">
          <Field label="Nome do exercício" className="flex-1">{(id) => <TextInput id={id} list="lib-exercises" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="ex.: Face pull" />}</Field>
          <Button variant="secondary" disabled={!extra.trim()} onClick={() => {
            const name = extra.trim();
            if (!added.some((a) => normalizeName(a) === normalizeName(name))) setAdded((x) => [...x, name]);
            setExtra('');
          }}>Adicionar</Button>
        </div>
        <datalist id="lib-exercises">{library.map((n) => <option key={n} value={n} />)}</datalist>
      </Card>

      <Card title="Cardio">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Modalidade">{(id) => <TextInput id={id} defaultValue={session.cardioModality ?? ''} placeholder={isCardio ? 'bicicleta…' : '—'}
            onBlur={(e) => e.target.value.trim() !== (session.cardioModality ?? '') && save(() => patchSession(session.id, { cardioModality: e.target.value.trim() || undefined }))} />}</Field>
          <Field label="Minutos">{(id) => <TextInput id={id} inputMode="numeric" value={cardioMin ?? (session.cardioMinutes !== undefined ? String(session.cardioMinutes) : '')}
            onChange={(e) => setCardioMin(e.target.value)}
            onBlur={() => { if (cardioMin !== null) { const v = parseDecimal(cardioMin); void save(() => patchSession(session.id, { cardioMinutes: v ?? undefined })); setCardioMin(null); } }} />}</Field>
          <Field label="Intensidade">{(id) => (
            <Select id={id} value={session.cardioIntensity !== undefined ? String(session.cardioIntensity) : ''} onChange={(e) => save(() => patchSession(session.id, { cardioIntensity: e.target.value ? Number(e.target.value) : undefined }))}>
              <option value="">—</option>
              {[2, 3, 4, 5, 6, 7, 8].map((v) => <option key={v} value={v}>{v}{v <= 3 ? ' leve' : v <= 6 ? ' moderada' : ' forte'}</option>)}
            </Select>
          )}</Field>
        </div>
        <p className="mt-2 text-xs text-muted">Baixo impacto. O app não estima calorias gastas nem libera mais comida por causa do treino.</p>
      </Card>

      <Card title="Desconforto e observações">
        <div className="space-y-3">
          <Field label="Desconforto durante a sessão">{(id) => <TextInput id={id} defaultValue={session.discomfort ?? ''} onBlur={(e) => e.target.value !== (session.discomfort ?? '') && save(() => patchSession(session.id, { discomfort: e.target.value.trim() || undefined }))} />}</Field>
          <Field label="Observações">{(id) => <TextInput id={id} defaultValue={session.notes ?? ''} onBlur={(e) => e.target.value !== (session.notes ?? '') && save(() => patchSession(session.id, { notes: e.target.value.trim() || undefined }))} />}</Field>
          <label className="flex items-start gap-3 rounded-xl border border-danger/40 p-3 text-[15px]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--danger)]" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>Estou com falta de ar, dor no peito ou senti desmaio</span>
          </label>
          {urgent && <EmergencyAlert />}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setDiscard(true)}>Descartar</Button>
        <Button onClick={() => setFinish(true)}>Finalizar sessão</Button>
      </div>

      <ConfirmDialog open={finish} title="Finalizar sessão" confirmLabel="Concluída" onCancel={() => setFinish(false)}
        onConfirm={async () => { const ok = await save(() => finishLiveSession(session.id, 'completed').then(() => true), 'Treino concluído e salvo'); if (ok) navigate('/treinos'); }}>
        <p className="num">Tempo: <Clock session={session} /> · {sets.length} séries registradas{session.cardioMinutes ? ` · ${session.cardioMinutes} min de cardio` : ''}.</p>
        <Button variant="secondary" className="w-full" onClick={async () => { const ok = await save(() => finishLiveSession(session.id, 'partial').then(() => true), 'Treino salvo como parcial'); if (ok) navigate('/treinos'); }}>Salvar como parcial</Button>
      </ConfirmDialog>
      <ConfirmDialog open={discard} title="Descartar sessão?" danger confirmLabel="Descartar" onCancel={() => setDiscard(false)}
        onConfirm={async () => { const ok = await save(() => deleteWorkoutSession(session.id).then(() => true), 'Sessão descartada'); if (ok) navigate('/treinos'); }}>
        <p>A sessão e as séries registradas nela serão apagadas. Para guardar o que foi feito, use “Finalizar” → parcial.</p>
      </ConfirmDialog>
    </Page>
  );
}
