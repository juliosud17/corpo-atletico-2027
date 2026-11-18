import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, EmptyState, Field, Segmented, Select, Sheet, TextInput, cx, useToast } from '../../components/ui';
import { IconBook, IconLink, IconPlus } from '../../components/ui/icons';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db, uid } from '../../data/db';
import { deleteRecipe, saveFoodLog, saveRecipe } from '../../data/repo';
import { dayTotals, fmt, fmtInt, nutrientsForAmount, parseDecimal, targetsForDate } from '../../domain/calculations';
import { localDateTimeToISO, timeInTimeZone } from '../../domain/dates';
import { mealTargets } from '../../domain/meals';
import {
  buildIngredients, consumedFromRecipe, formatPortions, norm, parseRecipeHtml, parseRecipeText, perServing, recipeTotals, suggestPortions,
} from '../../domain/recipes';
import type { FoodItem, FoodLog, Recipe, RecipeIngredient } from '../../domain/types';
import { UNIT_LABEL, suggestMeal } from '../nutrition/FoodSheet';

type Draft = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

const emptyDraft = (): Draft => ({ name: '', servings: 4, ingredients: [] });

// ------------------------------------------------------------------------------------------------
// Lista
// ------------------------------------------------------------------------------------------------
export function RecipesTab({ day }: { day: string }) {
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const foods = useLiveQuery(() => db.foodItems.toArray(), [], [] as FoodItem[]);
  const { open } = useSheets();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState('');
  const list = recipes.filter((r) => !query.trim() || norm(r.name).includes(norm(query))).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || b.updatedAt.localeCompare(a.updatedAt));

  return (
    <>
      <Card title="Minhas receitas" subtitle="Importe da internet ou crie a sua" icon={<IconBook />}
        action={<Button className="!px-3" onClick={() => setEditing(emptyDraft())}><IconPlus /> Criar</Button>}>
        <Button variant="secondary" className="w-full" onClick={() => setImporting(true)}><IconLink /> Importar da internet</Button>
        {recipes.length > 3 && <div className="mt-3"><TextInput type="search" aria-label="Buscar receita" placeholder="Buscar receita…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>}
        <div className="mt-3 space-y-2">
          {list.length === 0 ? <EmptyState icon="📖">Sua primeira receita aparecerá aqui. Cole uma receita da internet e o app calcula calorias e macros por porção.</EmptyState> : list.map((r) => {
            const t = recipeTotals(r, foods);
            const ps = perServing(t, r);
            return (
              <div key={r.id} className="rounded-3xl border border-line bg-card2/40 p-4">
                <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setEditing(r)} aria-label={`Abrir receita ${r.name}`}>
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold leading-snug">{r.favorite && <span className="text-accent">★ </span>}{r.name}</span>
                    <span className="mt-1 block text-xs">
                      <span className="font-bold uppercase tracking-wide text-accent">Receita</span>
                      <span className="text-muted"> · rende {fmt(r.servings, r.servings % 1 ? 1 : 0)} {r.servings === 1 ? 'porção' : 'porções'}{ps.grams ? ` · ${fmtInt(ps.grams)} g/porção` : ''}</span>
                    </span>
                  </span>
                  <span className="num shrink-0 text-right">
                    <span className="block text-[22px] font-bold leading-none">{fmtInt(ps.kcal)} <span className="text-xs font-medium text-muted">KCAL</span></span>
                    <span className="mt-1 block text-[11px] font-semibold tracking-wide text-muted">P:{fmtInt(ps.proteinG)}G C:{fmtInt(ps.carbsG)}G G:{fmtInt(ps.fatG)}G</span>
                  </span>
                </button>
                {t.pending > 0 && <p className="mt-2 text-xs text-warn">⚠ {t.pending} ingrediente(s) sem quantidade ou alimento: conta parcial.</p>}
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" className="flex-1 !min-h-10 !text-[12px]" onClick={() => open({ kind: 'recipePick', date: day, recipeId: r.id })}>Comer agora</Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">Valores por porção, somando os ingredientes com dados da TACO/IBGE. Peso pronto (opcional) permite servir em gramas.</p>
      </Card>
      {importing && <ImportRecipeSheet foods={foods} onClose={() => setImporting(false)} onParsed={(d) => { setImporting(false); setEditing(d); }} />}
      {editing && <RecipeEditor draft={editing} foods={foods} onClose={() => setEditing(null)} />}
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// Importar
// ------------------------------------------------------------------------------------------------
function ImportRecipeSheet({ foods, onClose, onParsed }: { foods: FoodItem[]; onClose: () => void; onParsed: (d: Draft) => void }) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function fromParsed(p: { name?: string; servings?: number; ingredients: string[]; sourceUrl?: string }) {
    if (!p.ingredients.length) { setMsg('Não encontrei a lista de ingredientes. Cole o texto com uma linha por ingrediente (ex.: “500 g de peito de frango”).'); return; }
    onParsed({
      name: p.name?.slice(0, 160) || 'Receita importada', servings: p.servings && p.servings > 0 ? p.servings : 4,
      ingredients: buildIngredients(p.ingredients, foods, uid), sourceUrl: p.sourceUrl ?? (url.trim() || undefined),
    });
  }

  async function tryUrl() {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) { setMsg('Cole o endereço completo, começando com https://'); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(u, { mode: 'cors', credentials: 'omit' });
      const html = await res.text();
      const p = parseRecipeHtml(html, u);
      if (p && p.ingredients.length) { fromParsed(p); return; }
      setMsg('A página abriu, mas não traz a receita em formato legível. Copie os ingredientes do site e cole abaixo.');
    } catch {
      setMsg('Este site não permite que o app leia a página diretamente (bloqueio de segurança do navegador, comum em sites de receitas). Abra a receita, copie o título, o rendimento e os ingredientes, e cole no campo abaixo — o link fica salvo como fonte.');
    } finally { setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title="Importar receita"
      footer={<Button className="w-full" disabled={!text.trim()} onClick={() => fromParsed({ ...parseRecipeText(text), sourceUrl: parseRecipeText(text).sourceUrl ?? (url.trim() || undefined) })}>Ler receita colada</Button>}>
      <div className="space-y-4">
        <Field label="Link da receita (opcional)">{(id) => <TextInput id={id} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />}</Field>
        <Button variant="secondary" className="w-full" disabled={!url.trim() || busy} onClick={tryUrl}>{busy ? 'Tentando ler…' : 'Tentar ler direto do link'}</Button>
        {msg && <Alert tone="info">{msg}</Alert>}
        <Field label="Ou cole a receita aqui" hint="Título, rendimento e ingredientes (uma linha cada). O modo de preparo é ignorado.">
          {(id) => <textarea id={id} rows={9} value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-2xl border border-line bg-card2 p-3 text-[15px]"
            placeholder={'Frango ao molho\nRendimento: 6 porções\nIngredientes\n1 kg de peito de frango\n2 colheres (sopa) de azeite\n1 cebola\n340 g de extrato de tomate\nSal a gosto'} />}
        </Field>
        <p className="text-xs text-muted">Dica no iPhone: no site, selecione os ingredientes → Copiar → volte aqui e cole. Os ingredientes são ligados automaticamente à base TACO/IBGE; você confere antes de salvar.</p>
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------------------------------------
// Editor
// ------------------------------------------------------------------------------------------------
function FoodPicker({ foods, onPick, onCancel }: { foods: FoodItem[]; onPick: (f: FoodItem) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = norm(q);
    return foods.filter((f) => !n || norm(f.name).includes(n)).sort((a, b) => Number(b.preparation === 'raw') - Number(a.preparation === 'raw') || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 12);
  }, [foods, q]);
  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-accent/40 p-2">
      <TextInput autoFocus type="search" aria-label="Buscar alimento para o ingrediente" placeholder="Buscar na base (ex.: cebola crua)" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-56 divide-y divide-line overflow-y-auto">
        {list.map((f) => (
          <li key={f.id}><button type="button" className="flex w-full justify-between gap-2 px-2 py-2 text-left text-sm hover:bg-card2" onClick={() => onPick(f)}>
            <span>{f.name}</span><span className="num shrink-0 text-xs text-muted">{fmtInt(f.kcalPerReference)} kcal/{fmt(f.referenceAmount, 0)} {UNIT_LABEL[f.referenceUnit]}</span>
          </button></li>
        ))}
      </ul>
      <Button variant="ghost" className="w-full !min-h-9" onClick={onCancel}>Cancelar</Button>
    </div>
  );
}

function IngredientRow({ ing, foods, onChange, onRemove }: { ing: RecipeIngredient; foods: FoodItem[]; onChange: (i: RecipeIngredient) => void; onRemove: () => void }) {
  const [picking, setPicking] = useState(false);
  const food = ing.foodId ? foods.find((f) => f.id === ing.foodId) : undefined;
  const n = food && ing.amount ? nutrientsForAmount(food, ing.amount, food.referenceUnit) : null;
  const status = ing.ignored ? 'ignored' : !food ? 'nofood' : !ing.amount ? 'noamount' : 'ok';
  const badge = { ok: ['✔', 'text-ok'], ignored: ['—', 'text-muted'], nofood: ['?', 'text-warn'], noamount: ['⚠', 'text-warn'] }[status];
  return (
    <li className={cx('rounded-2xl border p-3', status === 'ok' ? 'border-line' : status === 'ignored' ? 'border-line opacity-70' : 'border-warn/50')}>
      <div className="flex items-start gap-2">
        <span aria-hidden className={cx('mt-0.5 w-4 shrink-0 text-center font-bold', badge[1])}>{badge[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">{ing.text}</p>
          {ing.ignored ? <p className="text-xs text-muted">Ignorado (sem calorias relevantes)</p>
            : food ? <p className="text-xs text-muted">→ {food.name}</p>
            : <p className="text-xs text-warn">Escolha o alimento correspondente na base.</p>}
        </div>
        <button type="button" aria-label={`Remover ${ing.text}`} className="min-h-9 shrink-0 px-1 text-muted" onClick={onRemove}>✕</button>
      </div>
      {!ing.ignored && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
          {food && (
            <span className="flex items-center gap-1.5">
              <TextInput aria-label={`Quantidade de ${ing.text}`} inputMode="decimal" value={ing.amount !== undefined ? String(Math.round(ing.amount * 10) / 10).replace('.', ',') : ''} placeholder="?"
                onChange={(e) => onChange({ ...ing, amount: parseDecimal(e.target.value) ?? undefined })} className="num !min-h-9 !w-24 text-right" />
              <span className="text-xs text-muted">{UNIT_LABEL[food.referenceUnit]}</span>
            </span>
          )}
          {n?.kcal !== undefined && <span className="num text-xs text-muted">{fmtInt(n.kcal)} kcal · P {fmt(n.proteinG)} g</span>}
          <button type="button" className="text-xs font-semibold uppercase tracking-wide text-accent" onClick={() => setPicking(!picking)}>{food ? 'Trocar' : 'Escolher alimento'}</button>
        </div>
      )}
      <div className="mt-1 pl-6">
        <button type="button" className="text-xs text-muted underline" onClick={() => onChange({ ...ing, ignored: !ing.ignored })}>{ing.ignored ? 'Contar este ingrediente' : 'Ignorar (sal, água, temperos)'}</button>
      </div>
      {picking && <FoodPicker foods={foods} onCancel={() => setPicking(false)} onPick={(f) => { onChange({ ...ing, foodId: f.id, ignored: false }); setPicking(false); }} />}
      {status === 'noamount' && food && <p className="mt-1 pl-6 text-xs text-warn">Informe em {UNIT_LABEL[food.referenceUnit]} (xícaras/unidades de sólidos variam de peso — pese ou use o rótulo).</p>}
    </li>
  );
}

export function RecipeEditor({ draft, foods, onClose }: { draft: Draft; foods: FoodItem[]; onClose: () => void }) {
  const save = useSave();
  const settings = useSettingsOrDefault();
  const today = useToday();
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const [r, setR] = useState<Draft>(draft);
  const [servings, setServings] = useState(String(draft.servings).replace('.', ','));
  const [weight, setWeight] = useState(draft.cookedWeightG ? String(draft.cookedWeightG) : '');
  const [newLine, setNewLine] = useState('');
  const [del, setDel] = useState(false);
  const recipe: Draft = { ...r, servings: parseDecimal(servings) ?? 0, cookedWeightG: parseDecimal(weight) ?? undefined };
  const t = recipeTotals(recipe, foods);
  const ps = perServing(t, recipe);
  const tg = targetsForDate(targetsAll, today);
  const meals = tg ? mealTargets(settings.meals, tg, settings.mealSplits) : [];
  const valid = r.name.trim() && recipe.servings > 0;

  const setIng = (i: number, ing: RecipeIngredient) => setR((x) => ({ ...x, ingredients: x.ingredients.map((y, j) => (j === i ? ing : y)) }));

  return (
    <>
      <Sheet open onClose={onClose} title={draft.id ? 'Receita' : 'Nova receita'}
        footer={<div className="flex gap-2">
          {draft.id && <Button variant="secondary" aria-label="Excluir receita" onClick={() => setDel(true)}>🗑️</Button>}
          <Button className="flex-1" disabled={!valid} onClick={async () => { const id = await save(() => saveRecipe({ ...recipe, name: r.name.trim() }), 'Receita salva'); if (id) onClose(); }}>Salvar receita</Button>
        </div>}>
        <div className="space-y-4">
          <Field label="Nome">{(id) => <TextInput id={id} value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="ex.: Frango ao molho" />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rende (porções)">{(id) => <TextInput id={id} inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />}</Field>
            <Field label="Peso pronto (g)" hint="Opcional: pese a panela/forma pronta (sem o recipiente).">{(id) => <TextInput id={id} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="—" />}</Field>
          </div>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={!!r.favorite} onChange={(e) => setR({ ...r, favorite: e.target.checked })} /> Receita favorita (★ aparece primeiro)</label>

          <div className="rounded-3xl border border-accent/40 bg-accent-soft p-4">
            <p className="eyebrow !text-accent">Por porção</p>
            <p className="num mt-1 text-3xl font-bold">{fmtInt(ps.kcal)} <span className="text-sm font-medium text-muted">kcal{ps.grams ? ` · ${fmtInt(ps.grams)} g` : ''}</span></p>
            <p className="num text-sm text-muted">P {fmt(ps.proteinG)} g · C {fmt(ps.carbsG)} g · G {fmt(ps.fatG)} g</p>
            <p className="num mt-2 text-xs text-muted">Receita inteira: {fmtInt(t.kcal)} kcal · P {fmtInt(t.proteinG)} g · {t.counted} ingrediente(s) na conta{recipe.cookedWeightG ? ` · ${fmtInt((t.kcal / recipe.cookedWeightG) * 100)} kcal por 100 g pronto` : ''}</p>
            {t.pending > 0 && <p className="mt-1 text-xs font-semibold text-warn">⚠ {t.pending} ingrediente(s) pendente(s): o valor real é maior.</p>}
          </div>

          {meals.length > 0 && ps.kcal > 0 && (
            <div>
              <p className="eyebrow mb-2">Quanto comer em cada refeição</p>
              <table className="w-full text-sm">
                <caption className="sr-only">Porções sugeridas por refeição para bater a meta de calorias</caption>
                <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Refeição</th><th className="py-1 text-right font-medium">Meta</th><th className="py-1 text-right font-medium">Comer</th><th className="py-1 text-right font-medium">Proteína</th></tr></thead>
                <tbody>
                  {meals.map((m) => {
                    const s = suggestPortions(ps, m.kcal);
                    return (
                      <tr key={m.label} className="border-t border-line">
                        <td className="py-2">{m.label}</td>
                        <td className="num py-2 text-right text-muted">{fmtInt(m.kcal)} kcal</td>
                        <td className="num py-2 text-right font-semibold">{s ? <>{formatPortions(s.portions)}{s.grams ? <span className="block text-xs font-normal text-muted">≈ {fmtInt(s.grams)} g</span> : null}</> : '—'}</td>
                        <td className="num py-2 text-right">{s ? `${fmtInt(s.proteinG)} g` : '—'}{s && <span className="block text-xs text-muted">meta {fmtInt(m.proteinG)} g</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-muted">Para a receita sozinha cobrir a meta de kcal da refeição (múltiplos de ¼ de porção). Se for comer junto com arroz, feijão etc., use “Comer agora” na refeição, que considera o que já foi registrado.</p>
            </div>
          )}

          <div>
            <p className="eyebrow mb-2">Ingredientes ({r.ingredients.length})</p>
            <ul className="space-y-2">
              {r.ingredients.map((ing, i) => <IngredientRow key={ing.id} ing={ing} foods={foods} onChange={(x) => setIng(i, x)} onRemove={() => setR((x) => ({ ...x, ingredients: x.ingredients.filter((_, j) => j !== i) }))} />)}
            </ul>
            <div className="mt-2 flex items-end gap-2">
              <Field label="Adicionar ingrediente" className="flex-1">{(id) => <TextInput id={id} value={newLine} onChange={(e) => setNewLine(e.target.value)} placeholder="ex.: 300 g de acém" />}</Field>
              <Button variant="secondary" disabled={!newLine.trim()} onClick={() => { setR((x) => ({ ...x, ingredients: [...x.ingredients, ...buildIngredients([newLine.trim()], foods, uid)] })); setNewLine(''); }}>+</Button>
            </div>
          </div>
          <Field label="Link da receita">{(id) => <TextInput id={id} type="url" value={r.sourceUrl ?? ''} onChange={(e) => setR({ ...r, sourceUrl: e.target.value || undefined })} placeholder="https://…" />}</Field>
          {r.sourceUrl && /^https?:\/\//.test(r.sourceUrl) && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">Abrir receita original ↗</a>}
          <Field label="Anotações (modo de preparo, ajustes)">{(id) => <textarea id={id} rows={3} className="w-full rounded-2xl border border-line bg-card2 p-3" value={r.notes ?? ''} onChange={(e) => setR({ ...r, notes: e.target.value || undefined })} />}</Field>
          <p className="text-xs text-muted">Ingredientes ligados aos itens crus da TACO quando a receita lista alimentos crus. Para ovos e itens por unidade, salve antes a porção (ex.: “1 ovo” = 50 g) em Alimentos, ou informe os gramas aqui.</p>
        </div>
      </Sheet>
      <ConfirmDialog open={del} danger title="Excluir receita?" confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { if (draft.id) { const ok = await save(() => deleteRecipe(draft.id!).then(() => true), 'Receita excluída'); if (ok) { setDel(false); onClose(); } } }}>
        <p>Os registros já feitos com esta receita continuam no diário.</p>
      </ConfirmDialog>
    </>
  );
}

// ------------------------------------------------------------------------------------------------
// Registrar receita numa refeição (quanto comer)
// ------------------------------------------------------------------------------------------------
export function RecipePickSheet({ date, meal: initialMeal, recipeId, onClose }: { date: string; meal?: string; recipeId?: string; onClose: () => void }) {
  const settings = useSettingsOrDefault();
  const today = useToday();
  const save = useSave();
  const { show } = useToast();
  const recipes = useLiveQuery(() => db.recipes.toArray(), [], [] as Recipe[]);
  const foods = useLiveQuery(() => db.foodItems.toArray(), [], [] as FoodItem[]);
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const nowTime = timeInTimeZone(new Date(), settings.timeZone);
  const [meal, setMeal] = useState(initialMeal ?? suggestMeal(settings.meals, nowTime));
  const [rid, setRid] = useState<string | undefined>(recipeId);
  const [mode, setMode] = useState<'portions' | 'grams'>('portions');
  const [amount, setAmount] = useState('');
  const mealLogs = useLiveQuery(() => db.foodLogs.where('date').equals(date).filter((l) => l.mealLabel === meal).toArray(), [date, meal], [] as FoodLog[]);
  const recipe = recipes.find((r) => r.id === rid);
  const tg = targetsForDate(targetsAll, date);
  const mt = tg ? mealTargets(settings.meals, tg, settings.mealSplits).find((m) => m.label === meal) : undefined;
  const consumed = dayTotals(mealLogs);
  const remaining = mt ? mt.kcal - consumed.kcal : 0;
  const t = recipe ? recipeTotals(recipe, foods) : null;
  const ps = recipe && t ? perServing(t, recipe) : null;
  const sug = ps && remaining > 0 ? suggestPortions(ps, remaining) : null;
  const amountN = parseDecimal(amount);
  const eaten = recipe && t && amountN ? consumedFromRecipe(t, recipe, amountN, mode) : null;
  const mealOptions = settings.meals.some((m) => m.label === meal) ? settings.meals : [...settings.meals, { label: meal, time: '' }];

  async function submit() {
    if (!recipe || !eaten || !amountN) return;
    const consumedAt = localDateTimeToISO(date, date === today ? nowTime : settings.meals.find((m) => m.label === meal)?.time ?? '12:00');
    const id = await save(() => saveFoodLog({
      date, consumedAt, mealLabel: meal, recipeId: recipe.id,
      description: `${recipe.name} (${mode === 'portions' ? formatPortions(amountN) : `${fmtInt(amountN)} g`})`,
      amount: amountN, unit: mode === 'portions' ? 'unit' : 'g', preparation: 'cooked',
      kcal: eaten.kcal, proteinG: eaten.proteinG, carbsG: eaten.carbsG, fatG: eaten.fatG, nutritionIsEstimated: false,
      note: t && t.pending ? `${t.pending} ingrediente(s) sem dados na receita` : undefined,
    }), `${recipe.name} registrada em ${meal}`);
    if (id) { if (t?.pending) show('A receita tem ingredientes sem dados: o valor registrado é parcial.', 'info'); onClose(); }
  }

  return (
    <Sheet open onClose={onClose} title="Comer receita"
      footer={<Button className="w-full" disabled={!eaten} onClick={submit}>Registrar em {meal}</Button>}>
      <div className="space-y-4">
        <Field label="Refeição">{(id) => <Select id={id} value={meal} onChange={(e) => setMeal(e.target.value)}>{mealOptions.map((m) => <option key={m.label} value={m.label}>{m.label}{m.time ? ` · ${m.time}` : ''}</option>)}<option value="Extras">Extras</option></Select>}</Field>
        {!recipe ? (
          recipes.length === 0 ? <EmptyState icon="📖">Nenhuma receita salva. Crie ou importe em Alimentação → Receitas.</EmptyState> : (
            <ul className="space-y-2">
              {[...recipes].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name, 'pt-BR')).map((r) => {
                const pr = perServing(recipeTotals(r, foods), r);
                return (
                  <li key={r.id}><button type="button" onClick={() => { setRid(r.id); setAmount(''); setMode('portions'); }} className="flex w-full items-center justify-between gap-2 rounded-2xl border border-line p-3 text-left hover:border-accent">
                    <span className="min-w-0"><span className="block font-semibold">{r.favorite && <span className="text-accent">★ </span>}{r.name}</span><span className="text-xs text-muted">rende {fmt(r.servings, r.servings % 1 ? 1 : 0)} porções</span></span>
                    <span className="num shrink-0 text-right text-sm"><b>{fmtInt(pr.kcal)}</b> kcal<span className="block text-xs text-muted">P {fmtInt(pr.proteinG)} g /porção</span></span>
                  </button></li>
                );
              })}
            </ul>
          )
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 rounded-2xl bg-card2 p-3">
              <div><p className="font-semibold">{recipe.name}</p><p className="num text-xs text-muted">{fmtInt(ps!.kcal)} kcal · P {fmt(ps!.proteinG)} g por porção{ps!.grams ? ` (${fmtInt(ps!.grams)} g)` : ''}</p></div>
              {!recipeId && <button type="button" className="text-sm text-accent" onClick={() => setRid(undefined)}>Trocar</button>}
            </div>
            {mt && (
              <div className="rounded-2xl border border-accent/40 bg-accent-soft p-3 text-sm">
                <p className="eyebrow !text-accent">Meta do {meal.toLowerCase()}</p>
                <p className="num mt-1">{fmtInt(mt.kcal)} kcal · já registrado {consumed.hasEntries ? fmtInt(consumed.kcal) : 0} · <b>restam {fmtInt(Math.max(0, remaining))} kcal</b></p>
                {sug ? (
                  <button type="button" className="mt-2 w-full rounded-xl bg-accent px-3 py-2 text-left font-semibold text-accent-fg" onClick={() => { setMode('portions'); setAmount(String(sug.portions).replace('.', ',')); }}>
                    Sugestão: {formatPortions(sug.portions)}{sug.grams ? ` (≈ ${fmtInt(sug.grams)} g)` : ''} → {fmtInt(sug.kcal)} kcal, P {fmtInt(sug.proteinG)} g
                  </button>
                ) : <p className="mt-1 text-xs text-muted">{remaining <= 0 ? 'A meta desta refeição já foi atingida.' : '—'}</p>}
              </div>
            )}
            {recipe.cookedWeightG ? <Segmented label="Medir por" value={mode} onChange={(v) => { setMode(v); setAmount(''); }} options={[{ value: 'portions', label: 'Porções' }, { value: 'grams', label: 'Gramas' }]} /> : null}
            <Field label={mode === 'portions' ? 'Quantas porções' : 'Quantos gramas do preparo pronto'}>{(id) => <TextInput id={id} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="num text-lg font-semibold" placeholder={mode === 'portions' ? 'ex.: 1,5' : 'ex.: 250'} />}</Field>
            {mode === 'portions' && <div className="flex flex-wrap gap-1.5">{[0.5, 1, 1.5, 2].map((p) => <button key={p} type="button" className="rounded-full border border-line px-3 py-1.5 text-sm" onClick={() => setAmount(String(p).replace('.', ','))}>{formatPortions(p)}</button>)}</div>}
            {eaten && <p className="num rounded-2xl bg-card2 p-3 text-center"><b>{fmtInt(eaten.kcal)} kcal</b> · P {fmt(eaten.proteinG)} g · C {fmt(eaten.carbsG)} g · G {fmt(eaten.fatG)} g</p>}
            {t && t.pending > 0 && <p className="text-xs text-warn">⚠ A receita tem {t.pending} ingrediente(s) sem dados: o valor é parcial.</p>}
          </>
        )}
      </div>
    </Sheet>
  );
}
