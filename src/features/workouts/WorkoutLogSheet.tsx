import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Alert, Button, ConfirmDialog, Field, Select, Sheet, TextInput } from '../../components/ui';
import { useProfile, useSave, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteWorkoutSession, saveWorkoutSession } from '../../data/repo';
import { parseDecimal } from '../../domain/calculations';
import { localDateTimeToISO, weekday } from '../../domain/dates';
import type { WorkoutSession, WorkoutStatus } from '../../domain/types';
import { EmergencyAlert } from '../recovery/RecoverySheet';

export const STATUS_LABEL: Record<WorkoutStatus, string> = {
  planned: 'Planejado', completed: 'Concluído', partial: 'Parcial', postponed: 'Adiado', cancelled: 'Cancelado', not_cleared: 'Não liberado',
};
export const STATUS_ICON: Record<WorkoutStatus, string> = {
  planned: '○', completed: '✔', partial: '◐', postponed: '↷', cancelled: '✕', not_cleared: '⛔',
};

export function WorkoutLogSheet({ date: d, planId, session, onClose }: { date?: string; planId?: string; session?: WorkoutSession; onClose: () => void }) {
  const today = useToday();
  const profile = useProfile();
  const plans = useLiveQuery(() => db.workoutPlans.orderBy('order').toArray(), []) ?? [];
  const save = useSave();
  const [date, setDate] = useState(session?.date ?? d ?? today);
  const defaultPlan = planId ?? session?.planId ?? plans.find((p) => p.weekday === weekday(date))?.id ?? '';
  const [pid, setPid] = useState<string>(defaultPlan);
  const effectivePid = pid || defaultPlan;
  const plan = plans.find((p) => p.id === effectivePid);
  const cleared = !!profile?.medicalClearanceConfirmed;
  const needsClearance = !!plan?.requiresClearance && !cleared;
  const [status, setStatus] = useState<WorkoutStatus>(session?.status ?? (needsClearance ? 'not_cleared' : 'completed'));
  const [duration, setDuration] = useState(session?.durationMin ? String(session.durationMin) : '');
  const [cardio, setCardio] = useState(session?.cardioMinutes ? String(session.cardioMinutes) : '');
  const [modality, setModality] = useState(session?.cardioModality ?? '');
  const [rpe, setRpe] = useState(session?.rpe ? String(session.rpe) : '');
  const [discomfort, setDiscomfort] = useState(session?.discomfort ?? '');
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [urgent, setUrgent] = useState(false);
  const [confirmNoClearance, setConfirmNoClearance] = useState(false);
  const [del, setDel] = useState(false);

  const [touched, setTouched] = useState(!!session);
  useEffect(() => {
    if (!touched && profile !== undefined && plans.length) setStatus(needsClearance ? 'not_cleared' : 'completed');
  }, [touched, profile, plans.length, needsClearance]);
  const executes = status === 'completed' || status === 'partial';

  async function persist(confirmedWithoutClearance: boolean) {
    const n = (s: string) => { const v = parseDecimal(s); return v === null ? undefined : v; };
    const id = await save(() => saveWorkoutSession({
      id: session?.id, date, planId: plan?.id, status, durationMin: n(duration), cardioMinutes: n(cardio), cardioModality: modality.trim() || undefined, rpe: n(rpe),
      discomfort: discomfort.trim() || undefined, notes: notes.trim() || undefined,
      completedAt: executes ? localDateTimeToISO(date, '12:00') : undefined,
      confirmedWithoutClearance: confirmedWithoutClearance || undefined,
    }), `Treino registrado como “${STATUS_LABEL[status]}”`);
    if (id) onClose();
  }

  function submit() {
    if (executes && needsClearance) { setConfirmNoClearance(true); return; }
    void persist(false);
  }

  return (
    <>
      <Sheet open onClose={onClose} title={session ? 'Editar treino' : 'Registrar treino'}
        footer={<div className="flex gap-2">{session && <Button variant="secondary" aria-label="Excluir registro" onClick={() => setDel(true)}>🗑️</Button>}<Button className="flex-1" onClick={submit}>Salvar</Button></div>}>
        <div className="space-y-4">
          {needsClearance && (
            <Alert tone="warn" title="Sessão planejada / não liberada">
              Você ainda não confirmou orientação profissional. Recomendamos registrar como “Não liberado” ou “Adiado” até a avaliação profissional.
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Situação">{(id) => (
              <Select id={id} value={status} onChange={(e) => { setTouched(true); setStatus(e.target.value as WorkoutStatus); }}>
                {(Object.keys(STATUS_LABEL) as WorkoutStatus[]).filter((s) => s !== 'planned').map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </Select>
            )}</Field>
          </div>
          <Field label="Treino do plano">{(id) => (
            <Select id={id} value={effectivePid} onChange={(e) => setPid(e.target.value)}>
              <option value="">Atividade avulsa</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}</Field>
          {plan?.safetyNote && <p className="text-sm text-warn">⚠ {plan.safetyNote}</p>}
          {executes && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Duração (min)">{(id) => <TextInput id={id} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />}</Field>
              <Field label="Cardio (min)">{(id) => <TextInput id={id} inputMode="numeric" value={cardio} onChange={(e) => setCardio(e.target.value)} />}</Field>
              <Field label="Esforço (RPE 1–10)">{(id) => <TextInput id={id} inputMode="numeric" value={rpe} onChange={(e) => setRpe(e.target.value)} />}</Field>
              <Field label="Modalidade do cardio" className="col-span-3">{(id) => <TextInput id={id} value={modality} onChange={(e) => setModality(e.target.value)} placeholder="bicicleta, elíptico, caminhada leve…" />}</Field>
            </div>
          )}
          <Field label="Desconforto durante a sessão" hint="Interrompa qualquer movimento que provoque dor aguda ou piora.">{(id) => <TextInput id={id} value={discomfort} onChange={(e) => setDiscomfort(e.target.value)} placeholder="ex.: joelho direito no sentar e levantar" />}</Field>
          <Field label="Observações">{(id) => <TextInput id={id} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <label className="flex items-start gap-3 rounded-xl border border-danger/40 p-3 text-[15px]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--danger)]" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>Tive falta de ar, dor no peito ou desmaio</span>
          </label>
          {urgent && <EmergencyAlert />}
          <p className="text-xs text-muted">Registro rápido. Para séries, cargas e cronômetro, use ▶ Iniciar na tela Treinos. O app não estima calorias gastas.</p>
        </div>
      </Sheet>
      <ConfirmDialog open={confirmNoClearance} title="Registrar execução sem liberação?" confirmLabel="Sim, registrar"
        onCancel={() => setConfirmNoClearance(false)} onConfirm={() => { setConfirmNoClearance(false); void persist(true); }}>
        <p>Este treino exige orientação profissional prévia{profile?.healthNotes ? ` (${profile.healthNotes})` : ''}, que ainda não foi confirmada no seu perfil.</p>
        <p className="text-sm text-muted">O registro ficará marcado como “executado sem liberação confirmada”. Evite impacto, corrida e cargas altas.</p>
      </ConfirmDialog>
      <ConfirmDialog open={del} title="Excluir registro de treino?" danger confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { if (session) { const ok = await save(() => deleteWorkoutSession(session.id).then(() => true), 'Registro excluído'); if (ok) { setDel(false); onClose(); } } }}>
        <p>O registro de {STATUS_LABEL[session?.status ?? 'planned'].toLowerCase()} será removido.</p>
      </ConfirmDialog>
    </>
  );
}

export default WorkoutLogSheet;
