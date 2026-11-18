import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, Field, Page, ProgressBar, Sheet, TextInput, cx, useToast } from '../../components/ui';
import { useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { applyFavoriteMeal, copyMeal, deleteFoodItem, saveFavoriteMeal } from '../../data/repo';
import { dayTotals, fmt, fmtInt, hasAnyNutrition, kcalSummaryText, nutritionAdherence, targetsForDate, type DayTotals } from '../../domain/calculations';
import { addDays, formatBR, formatLongBR, formatShortBR, localDateTimeToISO, weekday, weekdayShort } from '../../domain/dates';
import type { FoodLog, NutritionTargets } from '../../domain/types';
import { PREP_LABEL, UNIT_LABEL } from './FoodSheet';

export function MacroBars({ totals, targets }: { totals: DayTotals; targets: NutritionTargets | null }) {
  if (!targets) return null;
  const rows = [
    { label: 'Proteína', v: totals.proteinG, t: targets.proteinG },
    { label: 'Carboidrato', v: totals.carbsG, t: targets.carbsG },
    { label: 'Gordura', v: totals.fatG, t: targets.fatG },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-sm"><span>{r.label}</span><span className="num text-muted"><b className="text-fg">{totals.hasEntries ? fmtInt(r.v) : '—'}</b> / {fmtInt(r.t)} g</span></div>
          <ProgressBar label={r.label} value={totals.hasEntries ? r.v : 0} max={r.t} tone={totals.hasEntries && r.v > r.t * 1.1 ? 'warn' : 'accent'} valueText={totals.hasEntries ? `${fmtInt(r.v)} de ${fmtInt(r.t)} g` : 'sem registro'} />
        </div>
      ))}
    </div>
  );
}

export function KcalHeadline({ totals, targets }: { totals: DayTotals; targets: NutritionTargets | null }) {
  return (
    <div>
      {totals.hasEntries ? (
        <p className="num text-3xl font-extrabold">{fmtInt(totals.kcal)}<span className="text-base font-medium text-muted"> / {fmtInt(targets?.caloriesKcal)} kcal</span></p>
      ) : (
        <p className="text-lg font-semibold text-muted">Nenhum alimento registrado <span className="text-sm font-normal">· meta {fmtInt(targets?.caloriesKcal)} kcal</span></p>
      )}
      <p className="text-xs text-muted">
        {totals.hasEntries ? kcalSummaryText(totals) : 'Ausência de registro não significa consumo zero.'}
        {totals.itemsEstimated > 0 && ` · ${totals.itemsEstimated} com kcal estimada pelos macros`}
      </p>
    </div>
  );
}

export function Nutrition() {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const { open } = useSheets();
  const save = useSave();
  const { show } = useToast();
  const [date, setDate] = useState<string | null>(null);
  const day = date ?? today;
  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(day).toArray(), [day], [] as FoodLog[]);
  const weekLogs = useLiveQuery(() => db.foodLogs.where('date').between(addDays(today, -6), today, true, true).toArray(), [today]) ?? [];
  const water = useLiveQuery(() => db.waterEntries.where('date').equals(day).toArray(), [day]) ?? [];
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const favorites = useLiveQuery(() => db.favoriteMeals.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foodItems.toArray(), []) ?? [];
  const tg = targetsForDate(targetsAll, day);
  const totals = dayTotals(logs);
  const waterTotal = water.reduce((s, w) => s + w.amountMl, 0);
  const [favFor, setFavFor] = useState<string | null>(null);
  const [favName, setFavName] = useState('');
  const [useFavFor, setUseFavFor] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [delFood, setDelFood] = useState<string | null>(null);

  const mealLabels = useMemo(() => {
    const labels = settings.meals.map((m) => m.label);
    for (const l of logs) if (!labels.includes(l.mealLabel)) labels.push(l.mealLabel);
    if (!labels.includes('Extras')) labels.push('Extras');
    return labels;
  }, [settings.meals, logs]);

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i));
  const byDay = new Map<string, FoodLog[]>();
  for (const l of weekLogs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const adh = nutritionAdherence(last7, byDay, targetsAll);
  const mealTime = (label: string) => settings.meals.find((m) => m.label === label)?.time ?? '12:00';

  return (
    <Page title="Alimentação" subtitle={formatLongBR(day)}
      action={<Button onClick={() => open({ kind: 'food', date: day })}>+ Alimento</Button>}>
      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Dia anterior" onClick={() => setDate(addDays(day, -1))}>‹</Button>
        <TextInput type="date" aria-label="Escolher dia" value={day} onChange={(e) => e.target.value && setDate(e.target.value)} className="flex-1 text-center" />
        <Button variant="secondary" aria-label="Próximo dia" onClick={() => setDate(addDays(day, 1))}>›</Button>
        {day !== today && <Button variant="ghost" onClick={() => setDate(null)}>Hoje</Button>}
      </div>

      <Card title="Total do dia">
        <KcalHeadline totals={totals} targets={tg} />
        <div className="mt-4"><MacroBars totals={totals} targets={tg} /></div>
        {tg && <p className="mt-3 text-xs text-muted">Meta vigente desde {formatBR(tg.effectiveDate)}: {fmtInt(tg.caloriesKcal)} kcal · P {fmtInt(tg.proteinG)} g · C {fmtInt(tg.carbsG)} g · G {fmtInt(tg.fatG)} g.</p>}
      </Card>

      {mealLabels.map((label) => {
        const items = logs.filter((l) => l.mealLabel === label).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const t = dayTotals(items);
        const ref = settings.meals.find((m) => m.label === label);
        return (
          <Card key={label} title={<>{label}{ref?.time && <span className="ml-1 font-normal normal-case">· {ref.time}</span>}</>}
            action={<span className="num text-xs text-muted">{t.hasEntries ? `${fmtInt(t.kcal)} kcal · P ${fmtInt(t.proteinG)} g` : ''}</span>}>
            {items.length > 0 ? (
              <ul className="mb-2 divide-y divide-line">
                {items.map((l) => (
                  <li key={l.id}>
                    <button type="button" className="flex w-full items-center justify-between gap-2 py-2 text-left" onClick={() => open({ kind: 'food', log: l })} aria-label={`Editar ${l.description}`}>
                      <span className="min-w-0 text-sm">
                        <span className="block truncate">{l.description}</span>
                        <span className="block text-xs text-muted">{fmt(l.amount, l.amount % 1 ? 1 : 0)} {UNIT_LABEL[l.unit]}{l.preparation ? ` · ${PREP_LABEL[l.preparation]}` : ''}</span>
                      </span>
                      <span className="num shrink-0 text-right text-xs">
                        {l.kcal !== undefined ? <span className="block font-semibold text-fg">{fmtInt(l.kcal)} kcal{l.nutritionIsEstimated ? '*' : ''}</span> : <span className="block text-warn">sem dados</span>}
                        {l.proteinG !== undefined && <span className="block text-muted">P {fmt(l.proteinG)} · C {fmt(l.carbsG)} · G {fmt(l.fatG)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : ref?.reference ? <p className="mb-2 text-xs text-muted">Referência (não validada): {ref.reference}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="!min-h-9 !px-3 text-sm" onClick={() => open({ kind: 'food', date: day, meal: label })}>+ Adicionar</Button>
              <Button variant="ghost" className="!min-h-9 !px-3 text-sm" onClick={async () => {
                const n = await save(() => copyMeal(addDays(day, -1), day, label, localDateTimeToISO(day, mealTime(label))));
                if (n !== undefined) show(n ? `${n} item(ns) copiado(s) de ontem` : 'Ontem não há itens nesta refeição', n ? 'ok' : 'info');
              }}>Copiar de ontem</Button>
              {items.length > 0 && <Button variant="ghost" className="!min-h-9 !px-3 text-sm" onClick={() => { setFavFor(label); setFavName(`${label} favorito`); }}>★ Salvar favorita</Button>}
              {favorites.length > 0 && <Button variant="ghost" className="!min-h-9 !px-3 text-sm" onClick={() => setUseFavFor(label)}>Usar favorita</Button>}
            </div>
          </Card>
        );
      })}

      <Card title="Água" action={<Button variant="ghost" onClick={() => open({ kind: 'water', date: day })}>+ Água</Button>}>
        <p className="num text-2xl font-bold">{fmtInt(waterTotal)} <span className="text-sm font-medium text-muted">ml {tg ? `· referência ${fmtInt(tg.waterMinMl)}–${fmtInt(tg.waterMaxMl)} ml` : ''}</span></p>
        {tg && <div className="mt-2"><ProgressBar label="Água" value={waterTotal} max={tg.waterMinMl} valueText={`${fmtInt(waterTotal)} ml`} /></div>}
      </Card>

      <Card title="Últimos 7 dias">
        <ul className="grid grid-cols-7 gap-1 text-center">
          {last7.map((d) => {
            const t = dayTotals(byDay.get(d) ?? []);
            const tgd = targetsForDate(targetsAll, d);
            const hit = t.hasEntries && tgd && t.proteinG >= tgd.proteinG;
            return (
              <li key={d}>
                <button type="button" onClick={() => setDate(d)} className={cx('w-full rounded-lg border px-0.5 py-2 text-xs', d === day ? 'border-accent' : 'border-line')}
                  aria-label={`${formatBR(d)}: ${t.hasEntries ? `${fmtInt(t.kcal)} kcal registradas` : 'sem registro'}`}>
                  <span className="block text-muted">{weekdayShort(weekday(d))}</span>
                  <span className="block text-muted">{formatShortBR(d)}</span>
                  <span className={cx('num mt-1 block font-semibold', !t.hasEntries && 'text-muted')}>{t.hasEntries ? fmtInt(t.kcal) : '—'}</span>
                  <span aria-hidden className="block">{t.hasEntries ? (hit ? '💪' : '·') : ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-sm">Dias registrados: <b>{adh.daysLogged} de {adh.daysInPeriod}</b> · meta de proteína: <b>{adh.daysProteinHit} de {adh.daysLogged}</b> dias registrados {adh.daysLogged > 0 && <>· kcal na faixa ±10%: <b>{adh.daysWithinKcal} de {adh.daysLogged}</b></>}</p>
        <p className="text-xs text-muted">“—” = sem registro (não é 0 kcal). 💪 = meta de proteína atingida.</p>
      </Card>

      <Card title="Meu catálogo de alimentos" action={<Button variant="ghost" onClick={() => setCatalogOpen(!catalogOpen)}>{catalogOpen ? 'Fechar' : `Ver (${foods.length})`}</Button>}>
        <p className="text-sm text-muted">Itens iniciais vêm <b>sem valores nutricionais</b> — complete pelo rótulo ou por tabela confiável (TACO/NEPA-Unicamp, TBCA/USP) ao registrar.</p>
        {catalogOpen && (
          <ul className="mt-3 divide-y divide-line">
            {[...foods].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate">{f.name}</span><span className="block text-xs text-muted">por {fmt(f.referenceAmount, 0)} {UNIT_LABEL[f.referenceUnit]} · {hasAnyNutrition(f) ? `${f.kcalPerReference !== undefined ? fmtInt(f.kcalPerReference) + ' kcal' : ''} ${f.source ?? ''}` : 'sem dados'}</span></span>
                <button type="button" className="min-h-9 shrink-0 px-2 text-danger" onClick={() => setDelFood(f.id)} aria-label={`Excluir ${f.name} do catálogo`}>Excluir</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Preferências: {settings.foodPreferences}</p>
      </Card>

      <Alert tone="info">Sem moralizar alimentos: degustações, doces, bebidas, óleos e molhos entram em “Extras” como qualquer outro registro.</Alert>

      <Sheet open={!!favFor} onClose={() => setFavFor(null)} title="Salvar refeição favorita"
        footer={<Button className="w-full" onClick={async () => { if (favFor) { const n = await save(() => saveFavoriteMeal(favName.trim() || favFor, day, favFor), 'Favorita salva'); if (n !== undefined) setFavFor(null); } }}>Salvar</Button>}>
        <Field label="Nome da favorita">{(id) => <TextInput id={id} value={favName} onChange={(e) => setFavName(e.target.value)} />}</Field>
      </Sheet>
      <Sheet open={!!useFavFor} onClose={() => setUseFavFor(null)} title={`Usar favorita em ${useFavFor ?? ''}`}>
        <ul className="space-y-2">
          {favorites.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <Button variant="secondary" className="flex-1 justify-between" onClick={async () => {
                if (!useFavFor) return;
                const n = await save(() => applyFavoriteMeal(f.id, day, useFavFor, localDateTimeToISO(day, mealTime(useFavFor))), `“${f.name}” adicionada`);
                if (n !== undefined) setUseFavFor(null);
              }}><span>{f.name}</span><span className="text-xs text-muted">{f.items.length} itens</span></Button>
              <button type="button" className="min-h-11 px-2 text-danger" aria-label={`Excluir favorita ${f.name}`} onClick={() => save(() => db.favoriteMeals.delete(f.id), 'Favorita excluída')}>🗑️</button>
            </li>
          ))}
        </ul>
      </Sheet>
      <ConfirmDialog open={!!delFood} title="Excluir alimento do catálogo?" danger confirmLabel="Excluir" onCancel={() => setDelFood(null)}
        onConfirm={async () => { if (delFood) { await save(() => deleteFoodItem(delFood), 'Alimento excluído do catálogo'); setDelFood(null); } }}>
        <p>Os registros já feitos no diário continuam com seus valores.</p>
      </ConfirmDialog>
    </Page>
  );
}
