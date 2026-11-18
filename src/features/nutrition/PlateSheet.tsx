import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Button, Field, Select, Sheet, TextInput, cx } from '../../components/ui';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { GROUP_LABEL, type FoodGroup } from '../../data/foodDatabase';
import { saveFoodLogs } from '../../data/repo';
import { dayTotals, fmt, fmtInt, nutrientsForAmount, parseDecimal } from '../../domain/calculations';
import { localDateTimeToISO, timeInTimeZone } from '../../domain/dates';
import type { FoodItem } from '../../domain/types';
import { NutrientPreview, UNIT_LABEL, suggestMeal } from './FoodSheet';

const ORDER: FoodGroup[] = ['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'fat', 'other'];

/** Monta um prato com os alimentos do dia a dia e registra tudo de uma vez. */
export function PlateSheet({ date: d, meal, onClose }: { date?: string; meal?: string; onClose: () => void }) {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const save = useSave();
  const nowTime = timeInTimeZone(new Date(), settings.timeZone);
  const [date, setDate] = useState(d ?? today);
  const [mealLabel, setMealLabel] = useState(meal ?? suggestMeal(settings.meals, nowTime));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const foods = useLiveQuery(() => db.foodItems.filter((f) => !!f.favorite).toArray(), [], [] as FoodItem[]);
  const groups = useMemo(() => ORDER.map((g) => ({ g, items: foods.filter((f) => (f.group ?? 'other') === g).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) })).filter((x) => x.items.length), [foods]);

  const chosen = foods.map((f) => ({ f, amount: parseDecimal(amounts[f.id] ?? '') })).filter((x): x is { f: FoodItem; amount: number } => !!x.amount && x.amount > 0);
  const lines = chosen.map(({ f, amount }) => ({ f, amount, n: nutrientsForAmount(f, amount, f.referenceUnit)! }));
  const totals = dayTotals(lines.map((l) => l.n));

  async function submit() {
    if (!lines.length) return;
    const consumedAt = localDateTimeToISO(date, date === today ? nowTime : settings.meals.find((m) => m.label === mealLabel)?.time ?? '12:00');
    const n = await save(() => saveFoodLogs(lines.map(({ f, amount, n: nut }) => ({
      date, consumedAt, mealLabel, foodId: f.id, description: f.name, amount, unit: f.referenceUnit, preparation: f.preparation, ...nut,
    }))), `${lines.length} ${lines.length === 1 ? 'item adicionado' : 'itens adicionados'} em ${mealLabel}`);
    if (n) onClose();
  }

  const mealOptions = settings.meals.some((m) => m.label === mealLabel) ? settings.meals : [...settings.meals, { label: mealLabel, time: '' }];

  return (
    <Sheet open onClose={onClose} title="Montar prato"
      footer={<div className="space-y-2">
        <p className="num text-center text-sm">{lines.length ? <><b>{fmtInt(totals.kcal)} kcal</b> · P {fmt(totals.proteinG)} g · C {fmt(totals.carbsG)} g · G {fmt(totals.fatG)} g</> : <span className="text-muted">Informe as quantidades dos itens do prato</span>}</p>
        <Button className="w-full" disabled={!lines.length} onClick={submit}>Registrar {lines.length || ''} {lines.length === 1 ? 'item' : 'itens'}</Button>
      </div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dia">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Refeição">{(id) => (
            <Select id={id} value={mealLabel} onChange={(e) => setMealLabel(e.target.value)}>
              {mealOptions.map((m) => <option key={m.label} value={m.label}>{m.label}{m.time ? ` · ${m.time}` : ''}</option>)}
              <option value="Extras">Extras</option>
            </Select>
          )}</Field>
        </div>
        {groups.length === 0 && <p className="text-sm text-muted">Sua lista do dia a dia está vazia. Marque ☆ nos alimentos em “Adicionar alimento”.</p>}
        {groups.map(({ g, items }) => (
          <fieldset key={g} className="space-y-1.5">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{GROUP_LABEL[g]}</legend>
            {items.map((f) => {
              const v = amounts[f.id] ?? '';
              const filled = !!parseDecimal(v);
              return (
                <div key={f.id} className={cx('rounded-xl border p-2', filled ? 'border-accent bg-accent-soft' : 'border-line')}>
                  <div className="flex items-center gap-2">
                    <label htmlFor={`plate-${f.id}`} className="min-w-0 flex-1 text-sm leading-snug">{f.name}</label>
                    <TextInput id={`plate-${f.id}`} inputMode="decimal" value={v} placeholder="—" aria-label={`Quantidade de ${f.name} em ${UNIT_LABEL[f.referenceUnit]}`}
                      onChange={(e) => setAmounts((a) => ({ ...a, [f.id]: e.target.value }))} className="num !w-20 shrink-0 text-right" />
                    <span className="w-8 shrink-0 text-xs text-muted">{UNIT_LABEL[f.referenceUnit]}</span>
                  </div>
                  {(f.portions?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {f.portions!.map((p) => (
                        <button key={p.label} type="button" className="rounded-full border border-line px-2.5 py-1 text-xs" onClick={() => setAmounts((a) => ({ ...a, [f.id]: String(p.amount).replace('.', ',') }))}>{p.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
        {lines.length > 0 && <NutrientPreview n={{ kcal: totals.kcal, proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG, nutritionIsEstimated: false }} />}
      </div>
    </Sheet>
  );
}
