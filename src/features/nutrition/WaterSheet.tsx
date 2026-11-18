import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Field, ProgressBar, Sheet, TextInput } from '../../components/ui';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { addWater, deleteWater } from '../../data/repo';
import { fmtInt, parseDecimal, targetsForDate } from '../../domain/calculations';
import { localDateTimeToISO, timeInTimeZone } from '../../domain/dates';

export function WaterSheet({ date: d, onClose }: { date?: string; onClose: () => void }) {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const date = d ?? today;
  const save = useSave();
  const [custom, setCustom] = useState('');
  const entries = useLiveQuery(() => db.waterEntries.where('date').equals(date).toArray(), [date]) ?? [];
  const targets = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const tg = targetsForDate(targets, date);
  const total = entries.reduce((s, e) => s + e.amountMl, 0);
  const at = () => localDateTimeToISO(date, timeInTimeZone(new Date(), settings.timeZone));

  const add = (ml: number) => save(() => addWater(date, ml, at()), `+${fmtInt(ml)} ml de água`);

  return (
    <Sheet open onClose={onClose} title="Registrar água" footer={<Button className="w-full" variant="secondary" onClick={onClose}>Concluir</Button>}>
      <div className="space-y-4">
        <div className="text-center">
          <p className="num text-4xl font-extrabold">{fmtInt(total)} <span className="text-lg text-muted">ml</span></p>
          {tg && <p className="text-sm text-muted">Referência ajustável: {fmtInt(tg.waterMinMl)}–{fmtInt(tg.waterMaxMl)} ml/dia (não é prescrição)</p>}
        </div>
        {tg && <ProgressBar label="Água do dia" value={total} max={tg.waterMinMl} valueText={`${fmtInt(total)} de ${fmtInt(tg.waterMinMl)} ml`} />}
        <div className="grid grid-cols-3 gap-2">
          {[200, 300, 500].map((ml) => <Button key={ml} variant="secondary" className="min-h-14 text-lg" onClick={() => add(ml)}>+{ml} ml</Button>)}
        </div>
        <div className="flex items-end gap-2">
          <Field label="Outra quantidade (ml)" className="flex-1">{(id) => <TextInput id={id} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ex.: 750" />}</Field>
          <Button onClick={() => { const n = parseDecimal(custom); if (n && n > 0 && n <= 5000) { void add(n); setCustom(''); } }}>Adicionar</Button>
        </div>
        {entries.length > 0 && (
          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {[...entries].sort((a, b) => b.consumedAt.localeCompare(a.consumedAt)).map((e) => (
              <li key={e.id} className="flex items-center justify-between px-3 py-2">
                <span className="num">{fmtInt(e.amountMl)} ml · {timeInTimeZone(new Date(e.consumedAt), settings.timeZone)}</span>
                <button type="button" className="min-h-9 px-2 text-danger" aria-label={`Remover ${e.amountMl} ml`} onClick={() => save(() => deleteWater(e.id), 'Registro de água removido')}>Remover</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
