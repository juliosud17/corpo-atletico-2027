import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, ConfirmDialog, Field, Select, Sheet, TextInput, Toggle } from '../../components/ui';
import { useSave } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteExercise, deletePlan, moveExercise, saveExercise, savePlan } from '../../data/repo';
import { parseDecimal } from '../../domain/calculations';
import { weekdayName } from '../../domain/dates';
import type { ExercisePrescription, WorkoutPlan } from '../../domain/types';

const TYPE_LABEL: Record<WorkoutPlan['type'], string> = { strength: 'Musculação', cardio: 'Cardio', mobility: 'Mobilidade', rest: 'Descanso' };
const optInt = (v: string) => { const n = parseDecimal(v); return n === null ? undefined : Math.round(n); };

function ExerciseRow({ ex, first, last }: { ex: ExercisePrescription; first: boolean; last: boolean }) {
  const save = useSave();
  const [name, setName] = useState(ex.name);
  const [sets, setSets] = useState(ex.targetSets !== undefined ? String(ex.targetSets) : '');
  const [reps, setReps] = useState(ex.targetReps !== undefined ? String(ex.targetReps) : '');
  const [notes, setNotes] = useState(ex.notes ?? '');
  const dirty = name !== ex.name || sets !== (ex.targetSets?.toString() ?? '') || reps !== (ex.targetReps?.toString() ?? '') || notes !== (ex.notes ?? '');
  return (
    <li className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex gap-2">
        <TextInput aria-label="Nome do exercício" list="lib-exercises-editor" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <button type="button" disabled={first} className="min-h-11 w-9 rounded-lg text-muted disabled:opacity-30" aria-label={`Subir ${ex.name}`} onClick={() => save(() => moveExercise(ex.id, -1))}>↑</button>
        <button type="button" disabled={last} className="min-h-11 w-9 rounded-lg text-muted disabled:opacity-30" aria-label={`Descer ${ex.name}`} onClick={() => save(() => moveExercise(ex.id, 1))}>↓</button>
        <button type="button" className="min-h-11 w-9 text-danger" aria-label={`Remover ${ex.name}`} onClick={() => save(() => deleteExercise(ex.id), 'Exercício removido')}>✕</button>
      </div>
      <div className="grid grid-cols-[1fr_1fr_2fr] gap-2">
        <TextInput aria-label={`Séries de ${ex.name}`} inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} placeholder="séries" />
        <TextInput aria-label={`Repetições de ${ex.name}`} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="reps" />
        <TextInput aria-label={`Observações de ${ex.name}`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="observação" />
      </div>
      {dirty && <Button className="w-full !min-h-9" disabled={!name.trim()} onClick={() => save(() => saveExercise({ ...ex, name: name.trim(), targetSets: optInt(sets), targetReps: optInt(reps), notes: notes.trim() || undefined }), 'Exercício atualizado')}>Salvar alteração</Button>}
    </li>
  );
}

export function PlanEditor({ plan, onClose }: { plan?: WorkoutPlan; onClose: () => void }) {
  const save = useSave();
  const [name, setName] = useState(plan?.name ?? '');
  const [weekday, setWeekday] = useState(plan?.weekday ?? 1);
  const [type, setType] = useState<WorkoutPlan['type']>(plan?.type ?? 'strength');
  const [duration, setDuration] = useState(plan?.durationLabel ?? '');
  const [requires, setRequires] = useState(plan?.requiresClearance ?? true);
  const [note, setNote] = useState(plan?.safetyNote ?? '');
  const [planId, setPlanId] = useState(plan?.id);
  const [newEx, setNewEx] = useState('');
  const [del, setDel] = useState(false);
  const exercises = useLiveQuery(() => (planId ? db.exercises.where('workoutPlanId').equals(planId).sortBy('order') : []), [planId], [] as ExercisePrescription[]);
  const library = useLiveQuery(async () => {
    const s = new Set<string>();
    (await db.exercises.toArray()).forEach((e) => s.add(e.name));
    (await db.exerciseSets.toArray()).forEach((e) => s.add(e.exerciseName));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [], [] as string[]);

  async function savePlanInfo() {
    if (!name.trim()) return undefined;
    const id = await save(() => savePlan({ id: planId, name: name.trim(), weekday, type, durationLabel: duration.trim() || undefined, requiresClearance: type === 'rest' ? false : requires, safetyNote: note.trim() || undefined, order: plan?.order ?? Date.now() }), 'Treino salvo');
    if (id) setPlanId(id);
    return id;
  }

  return (
    <>
      <Sheet open onClose={onClose} title={plan ? 'Editar treino' : 'Novo treino'}
        footer={<div className="flex gap-2">{planId && <Button variant="secondary" aria-label="Excluir treino" onClick={() => setDel(true)}>🗑️</Button>}<Button className="flex-1" disabled={!name.trim()} onClick={async () => { if (await savePlanInfo()) onClose(); }}>Salvar e fechar</Button></div>}>
        <div className="space-y-4">
          <Field label="Nome do treino">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Musculação A" />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia da semana">{(id) => <Select id={id} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{weekdayName(d)}</option>)}</Select>}</Field>
            <Field label="Tipo">{(id) => <Select id={id} value={type} onChange={(e) => setType(e.target.value as WorkoutPlan['type'])}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Duração" className="col-span-2">{(id) => <TextInput id={id} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="ex.: 45–60 min" />}</Field>
          </div>
          {type !== 'rest' && <Toggle label="Exige liberação profissional" description="Enquanto não houver liberação, aparece como “não liberado” e pede confirmação para registrar execução." checked={requires} onChange={setRequires} />}
          <Field label="Aviso de segurança deste treino">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: interromper se houver dor no ombro" />}</Field>

          {type !== 'rest' && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Exercícios</p>
              {!planId ? <p className="text-sm text-muted">Salve o treino para adicionar exercícios.</p> : (
                <>
                  <ul className="space-y-2">{exercises.map((e, i) => <ExerciseRow key={`${e.id}-${e.order}`} ex={e} first={i === 0} last={i === exercises.length - 1} />)}</ul>
                  <div className="flex items-end gap-2">
                    <Field label="Novo exercício" className="flex-1">{(id) => <TextInput id={id} list="lib-exercises-editor" value={newEx} onChange={(e) => setNewEx(e.target.value)} />}</Field>
                    <Button variant="secondary" disabled={!newEx.trim()} onClick={async () => {
                      await save(() => saveExercise({ workoutPlanId: planId, name: newEx.trim(), targetSets: 3, targetReps: 10, order: exercises.length }), 'Exercício adicionado');
                      setNewEx('');
                    }}>Adicionar</Button>
                  </div>
                </>
              )}
              {!planId && <Button variant="secondary" className="w-full" disabled={!name.trim()} onClick={savePlanInfo}>Salvar treino</Button>}
            </div>
          )}
          <datalist id="lib-exercises-editor">{library.map((n) => <option key={n} value={n} />)}</datalist>
          <p className="text-xs text-muted">Troque exercícios, séries, repetições, duração e dias conforme a orientação recebida. O histórico de sessões já registradas não muda.</p>
        </div>
      </Sheet>
      <ConfirmDialog open={del} danger title="Excluir este treino?" confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { if (planId) { const ok = await save(() => deletePlan(planId).then(() => true), 'Treino excluído'); if (ok) { setDel(false); onClose(); } } }}>
        <p>O treino e seus exercícios prescritos serão removidos do plano. Sessões já registradas continuam no histórico.</p>
      </ConfirmDialog>
    </>
  );
}
