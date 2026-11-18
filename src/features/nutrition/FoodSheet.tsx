import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Alert, Button, ConfirmDialog, Field, Segmented, Select, Sheet, TextInput, cx } from '../../components/ui';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteFoodLog, saveFoodItem, saveFoodLog } from '../../data/repo';
import { completeKcal, fmt, fmtInt, hasAnyNutrition, kcalFromMacros, nutrientsForAmount, parseDecimal, type Nutrients } from '../../domain/calculations';
import { localDateTimeToISO, timeInTimeZone } from '../../domain/dates';
import type { FoodItem, FoodLog, MealSlot, Unit } from '../../domain/types';

export const UNIT_LABEL: Record<Unit, string> = { g: 'g', ml: 'ml', unit: 'unid.' };
export const PREP_LABEL = { raw: 'cru', cooked: 'cozido/preparado', other: 'outro' } as const;

/** Refeição sugerida pelo horário atual. */
export function suggestMeal(meals: MealSlot[], hhmm: string): string {
  if (!meals.length) return 'Refeição';
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const now = toMin(hhmm);
  let best = meals[0], bestD = Infinity;
  for (const m of meals) {
    const d = Math.min(Math.abs(toMin(m.time) - now), 1440 - Math.abs(toMin(m.time) - now));
    if (d < bestD) { bestD = d; best = m; }
  }
  return best.label;
}

const optNum = (s: string): number | undefined => { const n = parseDecimal(s); return n === null ? undefined : n; };
const str = (n?: number) => (n === undefined ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

export function NutrientPreview({ n }: { n: Nutrients | null }) {
  if (!n) return null;
  const none = n.kcal === undefined && n.proteinG === undefined && n.carbsG === undefined && n.fatG === undefined;
  if (none) return <Alert tone="info" title="Sem dados nutricionais">O item será registrado sem kcal e sem macros — nada será inventado. Você pode completar depois.</Alert>;
  return (
    <div className="grid grid-cols-4 gap-2 rounded-xl bg-card2 p-3 text-center">
      {[
        ['kcal', n.kcal, 0], ['Prot.', n.proteinG, 1], ['Carb.', n.carbsG, 1], ['Gord.', n.fatG, 1],
      ].map(([l, v, d]) => (
        <div key={l as string}>
          <p className="text-xs text-muted">{l as string}</p>
          <p className="num font-bold">{v === undefined ? '—' : d === 0 ? fmtInt(v as number) : fmt(v as number)}{l !== 'kcal' && v !== undefined && <span className="text-xs text-muted"> g</span>}</p>
        </div>
      ))}
      {n.nutritionIsEstimated && <p className="col-span-4 text-xs text-warn">kcal estimada por P×4 + C×4 + G×9 (sem valor de rótulo).</p>}
    </div>
  );
}

export function FoodSheet({ date: initialDate, meal, log, onClose }: { date?: string; meal?: string; log?: FoodLog; onClose: () => void }) {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const save = useSave();
  const foods = useLiveQuery(() => db.foodItems.toArray(), [], [] as FoodItem[]);
  const nowTime = timeInTimeZone(new Date(), settings.timeZone);

  const [mode, setMode] = useState<'catalog' | 'manual'>(log ? 'manual' : 'catalog');
  const [date, setDate] = useState(log?.date ?? initialDate ?? today);
  const [mealLabel, setMealLabel] = useState(log?.mealLabel ?? meal ?? suggestMeal(settings.meals, nowTime));
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [amount, setAmount] = useState(log ? str(log.amount) : '');
  const [editFood, setEditFood] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // manual
  const [desc, setDesc] = useState(log?.description ?? '');
  const [unit, setUnit] = useState<Unit>(log?.unit ?? 'g');
  const [prep, setPrep] = useState<FoodLog['preparation']>(log?.preparation);
  const [kcal, setKcal] = useState(log && !log.nutritionIsEstimated ? str(log.kcal) : '');
  const [p, setP] = useState(str(log?.proteinG));
  const [c, setC] = useState(str(log?.carbsG));
  const [f, setF] = useState(str(log?.fatG));
  const [saveToCatalog, setSaveToCatalog] = useState(false);

  // edição do alimento do catálogo
  const [fk, setFk] = useState(''); const [fp, setFp] = useState(''); const [fc, setFc] = useState(''); const [ff, setFf] = useState(''); const [fsrc, setFsrc] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return foods
      .filter((x) => !q || `${x.name} ${x.brand ?? ''}`.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(q))
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [foods, query]);

  const amountN = parseDecimal(amount);
  const catalogNutrients = selected && amountN ? nutrientsForAmount(selected, amountN, selected.referenceUnit) : null;
  const manualNutrients: Nutrients = completeKcal({ kcal: optNum(kcal), proteinG: optNum(p), carbsG: optNum(c), fatG: optNum(f), nutritionIsEstimated: false });
  const labelVsMacros = (() => {
    const k = optNum(kcal), pp = optNum(p), cc = optNum(c), gg = optNum(f);
    if (k === undefined || pp === undefined || cc === undefined || gg === undefined || k === 0) return null;
    const est = kcalFromMacros(pp, cc, gg);
    return Math.abs(est - k) / k > 0.08 ? est : null;
  })();

  function pick(food: FoodItem) {
    setSelected(food);
    setAmount(str(food.referenceAmount));
    setEditFood(false);
    setError(null);
  }

  function openFoodEdit(food: FoodItem) {
    setFk(str(food.kcalPerReference)); setFp(str(food.proteinGPerReference)); setFc(str(food.carbsGPerReference)); setFf(str(food.fatGPerReference));
    setFsrc(food.source?.startsWith('Catálogo inicial') ? '' : food.source ?? '');
    setEditFood(true);
  }

  async function saveFoodValues() {
    if (!selected) return;
    const upd = { ...selected, kcalPerReference: optNum(fk), proteinGPerReference: optNum(fp), carbsGPerReference: optNum(fc), fatGPerReference: optNum(ff), source: fsrc.trim() || 'Informado pelo usuário' };
    const ok = await save(() => saveFoodItem(upd), 'Valores do alimento salvos');
    if (ok) { setSelected({ ...upd, updatedAt: new Date().toISOString() }); setEditFood(false); }
  }

  async function submit() {
    const consumedAt = localDateTimeToISO(date, date === today ? nowTime : settings.meals.find((m) => m.label === mealLabel)?.time ?? '12:00');
    if (mode === 'catalog') {
      if (!selected) { setError('Escolha um alimento da lista'); return; }
      if (!amountN || amountN <= 0) { setError('Informe a quantidade'); return; }
      const n = nutrientsForAmount(selected, amountN, selected.referenceUnit)!;
      const id = await save(() => saveFoodLog({
        id: log?.id, date, consumedAt, mealLabel, foodId: selected.id, description: selected.name + (selected.brand ? ` (${selected.brand})` : ''),
        amount: amountN, unit: selected.referenceUnit, preparation: selected.preparation, ...n,
      }), `${selected.name} adicionado em ${mealLabel}`);
      if (id) onClose();
      return;
    }
    if (!desc.trim()) { setError('Descreva o alimento'); return; }
    if (!amountN || amountN <= 0) { setError('Informe a quantidade'); return; }
    const id = await save(async () => {
      let foodId = log?.foodId;
      if (saveToCatalog) {
        foodId = await saveFoodItem({ name: desc.trim(), preparation: prep, referenceAmount: amountN, referenceUnit: unit,
          kcalPerReference: optNum(kcal), proteinGPerReference: optNum(p), carbsGPerReference: optNum(c), fatGPerReference: optNum(f), source: 'Informado pelo usuário' });
      }
      return saveFoodLog({ id: log?.id, date, consumedAt: log?.consumedAt ?? consumedAt, mealLabel, foodId, description: desc.trim(), amount: amountN, unit, preparation: prep, ...manualNutrients });
    }, log ? 'Registro atualizado' : `${desc.trim()} adicionado em ${mealLabel}`);
    if (id) onClose();
  }

  const mealOptions = settings.meals.some((m) => m.label === mealLabel) ? settings.meals : [...settings.meals, { label: mealLabel, time: '' }];

  return (
    <>
      <Sheet open onClose={onClose} title={log ? 'Editar alimento' : 'Adicionar alimento'}
        footer={<div className="flex gap-2">
          {log && <Button variant="secondary" aria-label="Excluir registro" onClick={() => setConfirmDel(true)}>🗑️</Button>}
          <Button className="flex-1" onClick={submit}>Salvar no diário</Button>
        </div>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia do diário">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Refeição">{(id) => (
              <Select id={id} value={mealLabel} onChange={(e) => setMealLabel(e.target.value)}>
                {mealOptions.map((m) => <option key={m.label} value={m.label}>{m.label}{m.time ? ` · ${m.time}` : ''}</option>)}
                <option value="Extras">Extras (degustação, bebida, molho…)</option>
              </Select>
            )}</Field>
          </div>
          {!log && <Segmented label="Forma de registro" value={mode} onChange={(v) => { setMode(v); setError(null); }} options={[{ value: 'catalog', label: 'Do catálogo' }, { value: 'manual', label: 'Informar valores' }]} />}
          {error && <p role="alert" className="text-sm font-medium text-danger">⚠ {error}</p>}

          {mode === 'catalog' && !selected && (
            <div className="space-y-2">
              <Field label="Buscar alimento">{(id) => <TextInput id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="arroz, ovo, frango…" />}</Field>
              <ul className="max-h-[42dvh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {filtered.map((food) => (
                  <li key={food.id}>
                    <button type="button" onClick={() => pick(food)} className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left hover:bg-card2">
                      <span className="min-w-0">
                        <span className="block truncate">{food.favorite && '★ '}{food.name}</span>
                        <span className="block text-xs text-muted">
                          por {fmt(food.referenceAmount, 0)} {UNIT_LABEL[food.referenceUnit]}{food.preparation ? ` · ${PREP_LABEL[food.preparation]}` : ''}
                        </span>
                      </span>
                      <span className={cx('shrink-0 text-xs', hasAnyNutrition(food) ? 'text-muted num' : 'text-warn')}>
                        {hasAnyNutrition(food) ? (food.kcalPerReference !== undefined ? `${fmtInt(food.kcalPerReference)} kcal` : 'macros') : 'sem dados'}
                      </span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="p-4 text-center text-sm text-muted">Nada encontrado. Use “Informar valores” para cadastrar.</li>}
              </ul>
            </div>
          )}

          {mode === 'catalog' && selected && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2 rounded-xl bg-card2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-muted">Referência: {fmt(selected.referenceAmount, 0)} {UNIT_LABEL[selected.referenceUnit]}{selected.preparation ? ` · ${PREP_LABEL[selected.preparation]}` : ''}{selected.source ? ` · Fonte: ${selected.source}` : ''}</p>
                </div>
                <button type="button" className="shrink-0 text-sm text-accent" onClick={() => setSelected(null)}>Trocar</button>
              </div>
              <Field label={`Quantidade (${UNIT_LABEL[selected.referenceUnit]})`}>{(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" />}</Field>
              <NutrientPreview n={catalogNutrients} />
              {!editFood ? (
                <Button variant="ghost" className="w-full" onClick={() => openFoodEdit(selected)}>
                  {hasAnyNutrition(selected) ? 'Corrigir valores (marca, corte, preparo)' : 'Informar valores do rótulo/tabela'}
                </Button>
              ) : (
                <div className="space-y-3 rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold">Valores por {fmt(selected.referenceAmount, 0)} {UNIT_LABEL[selected.referenceUnit]}</p>
                  <MacroInputs k={fk} setK={setFk} p={fp} setP={setFp} c={fc} setC={setFc} f={ff} setF={setFf} />
                  <Field label="Fonte (rótulo, TACO, TBCA…)">{(id) => <TextInput id={id} value={fsrc} onChange={(e) => setFsrc(e.target.value)} placeholder="ex.: rótulo da embalagem" />}</Field>
                  <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setEditFood(false)}>Cancelar</Button><Button className="flex-1" onClick={saveFoodValues}>Salvar alimento</Button></div>
                </div>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <Field label="Alimento ou preparo">{(id) => <TextInput id={id} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="ex.: brigadeiro (degustação)" />}</Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Quantidade" className="col-span-1">{(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
                <Field label="Unidade">{(id) => <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}><option value="g">g</option><option value="ml">ml</option><option value="unit">unid.</option></Select>}</Field>
                <Field label="Estado">{(id) => <Select id={id} value={prep ?? ''} onChange={(e) => setPrep((e.target.value || undefined) as FoodLog['preparation'])}><option value="">—</option><option value="raw">cru</option><option value="cooked">cozido</option><option value="other">outro</option></Select>}</Field>
              </div>
              <p className="text-xs text-muted">Valores para a quantidade informada. Deixe em branco o que não souber — nada será inventado.</p>
              <MacroInputs k={kcal} setK={setKcal} p={p} setP={setP} c={c} setC={setC} f={f} setF={setF} />
              {labelVsMacros !== null && <Alert tone="info">Pelos macros daria ~{fmtInt(labelVsMacros)} kcal. Diferenças com o rótulo são comuns (arredondamento, fibras, álcool). O valor do rótulo será mantido.</Alert>}
              <NutrientPreview n={manualNutrients} />
              {!log && (
                <label className="flex min-h-11 items-center gap-3 text-[15px]">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={saveToCatalog} onChange={(e) => setSaveToCatalog(e.target.checked)} />
                  Salvar também no meu catálogo
                </label>
              )}
            </div>
          )}
        </div>
      </Sheet>
      <ConfirmDialog open={confirmDel} title="Excluir do diário?" danger confirmLabel="Excluir" onCancel={() => setConfirmDel(false)}
        onConfirm={async () => { if (log) { const ok = await save(() => deleteFoodLog(log.id).then(() => true), 'Registro excluído'); if (ok) { setConfirmDel(false); onClose(); } } }}>
        <p>“{log?.description}” será removido do diário de {log?.mealLabel}.</p>
      </ConfirmDialog>
    </>
  );
}

function MacroInputs({ k, setK, p, setP, c, setC, f, setF }: { k: string; setK: (v: string) => void; p: string; setP: (v: string) => void; c: string; setC: (v: string) => void; f: string; setF: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="kcal (rótulo)">{(id) => <TextInput id={id} inputMode="decimal" value={k} onChange={(e) => setK(e.target.value)} placeholder="—" />}</Field>
      <Field label="Proteína (g)">{(id) => <TextInput id={id} inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} placeholder="—" />}</Field>
      <Field label="Carboidrato (g)">{(id) => <TextInput id={id} inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} placeholder="—" />}</Field>
      <Field label="Gordura (g)">{(id) => <TextInput id={id} inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} placeholder="—" />}</Field>
    </div>
  );
}
