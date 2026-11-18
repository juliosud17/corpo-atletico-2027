import { useState } from 'react';
import { Button, ConfirmDialog, Field, Sheet, TextInput } from '../../components/ui';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { deleteWeight, saveWeight } from '../../data/repo';
import { fmt, parseDecimal } from '../../domain/calculations';
import { localDateTimeToISO, timeInTimeZone } from '../../domain/dates';
import { weightFormSchema } from '../../domain/validations';
import type { WeightEntry } from '../../domain/types';

export function WeightSheet({ entry, onClose }: { entry?: WeightEntry; onClose: () => void }) {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const save = useSave();
  const [date, setDate] = useState(entry?.date ?? today);
  const [time, setTime] = useState(entry?.time ?? timeInTimeZone(new Date(), settings.timeZone));
  const [weight, setWeight] = useState(entry ? String(entry.weightKg).replace('.', ',') : '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const w = parseDecimal(weight);
    const parsed = weightFormSchema.safeParse({ date, time: time || undefined, weightKg: w ?? NaN, note });
    if (!parsed.success) {
      setError(w === null ? 'Informe o peso, por exemplo 112,6' : parsed.error.issues[0]?.path[0] === 'weightKg' ? 'Peso deve estar entre 30 e 350 kg' : parsed.error.issues[0]?.message ?? 'Dados inválidos');
      return;
    }
    const id = await save(() => saveWeight({ id: entry?.id, date, time: time || undefined, weightKg: parsed.data.weightKg, note, measuredAt: localDateTimeToISO(date, time || '07:00') }),
      `Peso salvo: ${fmt(parsed.data.weightKg)} kg`);
    if (id) onClose();
  }

  return (
    <>
      <Sheet open onClose={onClose} title={entry ? 'Editar pesagem' : 'Registrar peso'}
        footer={
          <div className="flex gap-2">
            {entry && <Button variant="secondary" onClick={() => setConfirmDel(true)} aria-label="Excluir pesagem">🗑️</Button>}
            <Button className="flex-1" onClick={() => submit()}>Salvar peso</Button>
          </div>
        }>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Peso (kg)" error={error} hint="Ideal: pela manhã, após ir ao banheiro e antes de comer.">
            {(id) => (
              <TextInput id={id} data-autofocus inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="112,6"
                value={weight} onChange={(e) => { setWeight(e.target.value); setError(null); }}
                className="num text-center text-3xl font-bold min-h-16" />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">{(id) => <TextInput id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />}</Field>
            <Field label="Horário">{(id) => <TextInput id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          </div>
          <Field label="Observação (opcional)">{(id) => <TextInput id={id} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="ex.: após treino, balança da farmácia" />}</Field>
          <button type="submit" hidden />
        </form>
      </Sheet>
      <ConfirmDialog open={confirmDel} title="Excluir pesagem?" danger confirmLabel="Excluir"
        onCancel={() => setConfirmDel(false)}
        onConfirm={async () => { if (entry) { const ok = await save(() => deleteWeight(entry.id).then(() => true), 'Pesagem excluída'); if (ok) { setConfirmDel(false); onClose(); } } }}>
        <p>A pesagem de {fmt(entry?.weightKg)} kg será removida e os gráficos e médias serão recalculados.</p>
      </ConfirmDialog>
    </>
  );
}
