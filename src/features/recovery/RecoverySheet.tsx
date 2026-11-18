import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Sheet, TextInput, cx } from '../../components/ui';
import { useSave, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { saveRecovery } from '../../data/repo';
import { parseDecimal } from '../../domain/calculations';
import type { RecoveryEntry } from '../../domain/types';

export function EmergencyAlert() {
  return (
    <Alert tone="danger" title="Procure atendimento de emergência agora">
      Falta de ar, dor no peito ou desmaio exigem avaliação imediata. Ligue <a href="tel:192" className="font-bold underline">192 (SAMU)</a> ou vá ao pronto-socorro mais próximo. Interrompa qualquer exercício.
    </Alert>
  );
}

function Scale({ label, value, onChange, min, max, lowLabel, highLabel }: { label: string; value?: number; onChange: (v?: number) => void; min: number; max: number; lowLabel: string; highLabel: string }) {
  const opts = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {opts.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => onChange(value === n ? undefined : n)}
            className={cx('num min-h-10 min-w-10 flex-1 rounded-lg border text-sm', value === n ? 'border-accent bg-accent text-accent-fg font-bold' : 'border-line bg-card2')}>
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted"><span>{lowLabel}</span><span>{highLabel}</span></div>
    </fieldset>
  );
}

export function RecoverySheet({ date: d, entry, onClose }: { date?: string; entry?: RecoveryEntry; onClose: () => void }) {
  const today = useToday();
  const date = entry?.date ?? d ?? today;
  const existing = useLiveQuery(() => db.recovery.where('date').equals(date).first(), [date]);
  const save = useSave();
  const [r, setR] = useState<Partial<RecoveryEntry>>(entry ?? {});
  const [sleep, setSleep] = useState(entry?.sleepHours !== undefined ? String(entry.sleepHours).replace('.', ',') : '');
  const [loaded, setLoaded] = useState(!!entry);
  useEffect(() => {
    if (!loaded && existing !== undefined) {
      setR(existing); setSleep(existing.sleepHours !== undefined ? String(existing.sleepHours).replace('.', ',') : ''); setLoaded(true);
    }
  }, [existing, loaded]);
  const set = <K extends keyof RecoveryEntry>(k: K, v: RecoveryEntry[K]) => setR((x) => ({ ...x, [k]: v }));

  const highPain = [r.painLeftKnee0to10, r.painRightKnee0to10, r.painShoulder0to10, r.painLeftAnkle0to10].some((v) => (v ?? 0) >= 7);

  async function submit() {
    const sh = parseDecimal(sleep);
    const id = await save(() => saveRecovery({
      ...r, id: r.id ?? existing?.id, date, sleepHours: sh === null ? undefined : Math.max(0, Math.min(24, sh)),
    } as RecoveryEntry), 'Registro “Como estou hoje” salvo');
    if (id) onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Como estou hoje" footer={<Button className="w-full" onClick={submit}>Salvar</Button>}>
      <div className="space-y-5">
        <p className="text-sm text-muted">Todos os campos são opcionais. O app não faz diagnóstico nem classificação de risco.</p>

        <label className="flex items-start gap-3 rounded-xl border border-danger/40 p-3 text-[15px]">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--danger)]" checked={!!r.urgentSymptoms} onChange={(e) => set('urgentSymptoms', e.target.checked)} />
          <span>Tive falta de ar, dor no peito ou desmaio</span>
        </label>
        {r.urgentSymptoms && <EmergencyAlert />}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas dormidas">{(id) => <TextInput id={id} inputMode="decimal" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="ex.: 6,5" />}</Field>
        </div>
        <Scale label="Qualidade do sono" min={1} max={5} value={r.sleepQuality1to5} onChange={(v) => set('sleepQuality1to5', v)} lowLabel="ruim" highLabel="ótima" />
        <Scale label="Energia e disposição" min={1} max={5} value={r.energy1to5} onChange={(v) => set('energy1to5', v)} lowLabel="baixa" highLabel="alta" />
        <Scale label="Fome" min={1} max={5} value={r.hunger1to5} onChange={(v) => set('hunger1to5', v)} lowLabel="pouca" highLabel="muita" />
        <Scale label="Estresse" min={1} max={5} value={r.stress1to5} onChange={(v) => set('stress1to5', v)} lowLabel="baixo" highLabel="alto" />

        <div className="space-y-4 rounded-xl border border-line p-3">
          <p className="font-semibold">Dor (0 = nenhuma, 10 = máxima)</p>
          <Scale label="Joelho direito" min={0} max={10} value={r.painRightKnee0to10} onChange={(v) => set('painRightKnee0to10', v)} lowLabel="0" highLabel="10" />
          <Scale label="Joelho esquerdo" min={0} max={10} value={r.painLeftKnee0to10} onChange={(v) => set('painLeftKnee0to10', v)} lowLabel="0" highLabel="10" />
          <Scale label="Ombro" min={0} max={10} value={r.painShoulder0to10} onChange={(v) => set('painShoulder0to10', v)} lowLabel="0" highLabel="10" />
          <fieldset className="flex gap-2 text-sm" aria-label="Lado do ombro">
            {(['left', 'right', 'both'] as const).map((s) => (
              <button key={s} type="button" aria-pressed={r.shoulderSide === s} onClick={() => set('shoulderSide', r.shoulderSide === s ? undefined : s)}
                className={cx('min-h-9 flex-1 rounded-lg border', r.shoulderSide === s ? 'border-accent bg-accent-soft font-semibold' : 'border-line')}>
                {s === 'left' ? 'Esquerdo' : s === 'right' ? 'Direito' : 'Ambos'}
              </button>
            ))}
          </fieldset>
          <Scale label="Tornozelo esquerdo" min={0} max={10} value={r.painLeftAnkle0to10} onChange={(v) => set('painLeftAnkle0to10', v)} lowLabel="0" highLabel="10" />
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={!!r.leftAnkleSwollen} onChange={(e) => set('leftAnkleSwollen', e.target.checked)} />
            Tornozelo esquerdo inchado hoje
          </label>
          {r.leftAnkleSwollen && (
            <>
              <Scale label="Intensidade percebida do inchaço" min={1} max={5} value={r.ankleSwellingIntensity1to5} onChange={(v) => set('ankleSwellingIntensity1to5', v)} lowLabel="leve" highLabel="forte" />
              <Alert tone="warn">Inchaço em um só tornozelo, principalmente com piora, deve ser avaliado por um profissional de saúde. Se vier com dor intensa, vermelhidão, calor ou falta de ar, procure atendimento com urgência.</Alert>
            </>
          )}
          {highPain && <Alert tone="warn">Dor forte: interrompa movimentos que provoquem dor e procure o profissional responsável se persistir ou piorar.</Alert>}
        </div>

        <div className="space-y-3 rounded-xl border border-line p-3">
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={!!r.soughtProfessional} onChange={(e) => set('soughtProfessional', e.target.checked)} />
            Procurei avaliação profissional
          </label>
          {r.soughtProfessional && (
            <>
              <Field label="Data da avaliação">{(id) => <TextInput id={id} type="date" value={r.professionalDate ?? ''} onChange={(e) => set('professionalDate', e.target.value || undefined)} />}</Field>
              <Field label="Recomendações recebidas">{(id) => <textarea id={id} rows={3} className="w-full rounded-xl border border-line bg-card2 p-3" value={r.professionalNotes ?? ''} onChange={(e) => set('professionalNotes', e.target.value)} />}</Field>
            </>
          )}
        </div>

        <Field label="Humor e notas livres">{(id) => <textarea id={id} rows={3} className="w-full rounded-xl border border-line bg-card2 p-3" value={r.note ?? ''} onChange={(e) => set('note', e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
