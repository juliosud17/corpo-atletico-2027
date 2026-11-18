import { useState } from 'react';
import { Alert, Button, ConfirmDialog, Field, Sheet, TextInput } from '../../components/ui';
import { useSave, useToday } from '../../app/hooks';
import { deleteMeasurement, saveMeasurement } from '../../data/repo';
import { parseDecimal } from '../../domain/calculations';
import type { BodyMeasurement } from '../../domain/types';

const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));
const o = (v: string) => { const n = parseDecimal(v); return n === null ? undefined : n; };

export function MeasurementSheet({ entry, onClose }: { entry?: BodyMeasurement; onClose: () => void }) {
  const today = useToday();
  const save = useSave();
  const [date, setDate] = useState(entry?.measuredOn ?? today);
  const [waist, setWaist] = useState(s(entry?.waistCm));
  const [hip, setHip] = useState(s(entry?.hipCm));
  const [chest, setChest] = useState(s(entry?.chestCm));
  const [arm, setArm] = useState(s(entry?.armCm));
  const [thigh, setThigh] = useState(s(entry?.thighCm));
  const [bf, setBf] = useState(s(entry?.bodyFatPercent));
  const [bfMethod, setBfMethod] = useState(entry?.bodyFatMethod ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState(false);

  async function submit() {
    const m = { measuredOn: date, waistCm: o(waist), hipCm: o(hip), chestCm: o(chest), armCm: o(arm), thighCm: o(thigh), bodyFatPercent: o(bf), bodyFatMethod: bfMethod.trim() || undefined, note: note.trim() || undefined };
    const vals = [m.waistCm, m.hipCm, m.chestCm, m.armCm, m.thighCm, m.bodyFatPercent].filter((v) => v !== undefined) as number[];
    if (!vals.length) { setError('Preencha pelo menos uma medida'); return; }
    if (vals.some((v) => v <= 0 || v > 300)) { setError('Verifique os valores (em cm / %)'); return; }
    if (m.bodyFatPercent !== undefined && !m.bodyFatMethod) { setError('Informe o método da medição de gordura (ex.: bioimpedância, dobras)'); return; }
    const id = await save(() => saveMeasurement({ id: entry?.id, ...m }), 'Medidas salvas');
    if (id) onClose();
  }

  const num = (label: string, v: string, set: (x: string) => void, hint?: string) => (
    <Field label={label} hint={hint}>{(id) => <TextInput id={id} inputMode="decimal" value={v} onChange={(e) => { set(e.target.value); setError(null); }} placeholder="—" />}</Field>
  );

  return (
    <>
      <Sheet open onClose={onClose} title={entry ? 'Editar medidas' : 'Medir cintura e medidas'}
        footer={<div className="flex gap-2">{entry && <Button variant="secondary" aria-label="Excluir medidas" onClick={() => setDel(true)}>🗑️</Button>}<Button className="flex-1" onClick={submit}>Salvar medidas</Button></div>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">Todas opcionais. Mensalmente, no dia 17, em condições parecidas (mesmo horário, fita na altura do umbigo).</p>
          {error && <p role="alert" className="text-sm font-medium text-danger">⚠ {error}</p>}
          <Field label="Data">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            {num('Cintura no umbigo (cm)', waist, setWaist)}
            {num('Quadril (cm)', hip, setHip)}
            {num('Peito (cm)', chest, setChest)}
            {num('Braço (cm)', arm, setArm)}
            {num('Coxa (cm)', thigh, setThigh)}
          </div>
          <div className="space-y-3 rounded-xl border border-line p-3">
            <Alert tone="info">Percentual de gordura: somente se você mediu externamente. O app não estima gordura por peso ou fotos.</Alert>
            <div className="grid grid-cols-2 gap-3">
              {num('Gordura medida (%)', bf, setBf)}
              <Field label="Método">{(id) => <TextInput id={id} value={bfMethod} onChange={(e) => setBfMethod(e.target.value)} placeholder="bioimpedância…" />}</Field>
            </div>
          </div>
          <Field label="Observações">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
      </Sheet>
      <ConfirmDialog open={del} title="Excluir medidas?" danger confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { if (entry) { const ok = await save(() => deleteMeasurement(entry.id).then(() => true), 'Medidas excluídas'); if (ok) { setDel(false); onClose(); } } }}>
        <p>As medidas desta data serão removidas.</p>
      </ConfirmDialog>
    </>
  );
}
