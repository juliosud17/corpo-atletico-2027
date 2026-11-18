import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Alert, Button, Card, Page, ProgressBar, Sheet, StatTile, Tabs, TextInput, cx } from '../../components/ui';
import { IconChevron, IconClock, IconPlate, MealIcon } from '../../components/ui/icons';
import { useProfile, useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { updateSettings } from '../../data/repo';
import { bmi, dayTotals, fmt, fmtInt, kcalSummaryText, latestWeight, nutritionAdherence, parseDecimal, targetsForDate, type DayTotals } from '../../domain/calculations';
import { addDays, formatBR, formatLongBR, formatShortBR, timeInTimeZone, weekday, weekdayName, weekdayShort } from '../../domain/dates';
import { defaultSplits, effectiveSplits, mealStatus, mealTargets } from '../../domain/meals';
import { proteinFillers, remainingForDay } from '../../domain/nutrition';
import type { FoodItem, FoodLog, NutritionTargets } from '../../domain/types';
import { RecipesTab } from '../recipes/Recipes';
import { FoodsTab } from './FoodsTab';
import { STATUS_TEXT } from './MealSheet';
import { UNIT_LABEL, suggestMeal } from './FoodSheet';

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

/** O que falta para fechar as metas do dia e quanto de cada proteína do dia a dia cobriria a proteína restante. */
function CloseTheDay({ totals, targets, foods }: { totals: DayTotals; targets: NutritionTargets; foods: FoodItem[] }) {
  const r = remainingForDay(totals, targets);
  const fillers = proteinFillers(r.proteinG, foods.filter((f) => f.favorite && f.group === 'protein')).slice(0, 4);
  return (
    <div className="mt-4 rounded-xl border border-line p-3">
      <p className="text-sm font-semibold">Para fechar o dia</p>
      <p className="num mt-1 text-sm">
        {r.kcal >= 0 ? <>Faltam <b>{fmtInt(r.kcal)} kcal</b></> : <>Passou <b>{fmtInt(-r.kcal)} kcal</b> da meta</>}
        {' · '}{r.proteinG > 0 ? <>proteína: faltam <b>{fmtInt(r.proteinG)} g</b></> : <>proteína ✔</>}
        {' · '}C {r.carbsG > 0 ? `faltam ${fmtInt(r.carbsG)} g` : '✔'} · G {r.fatG > 0 ? `faltam ${fmtInt(r.fatG)} g` : '✔'}
      </p>
      {totals.itemsMissingKcal > 0 && <p className="mt-1 text-xs text-warn">Há itens sem dados: o que falta pode ser menos.</p>}
      {fillers.length > 0 && (
        <>
          <p className="mt-2 text-xs text-muted">Para completar a proteína com seus alimentos (cada opção sozinha):</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {fillers.map((x) => <li key={x.food.id} className="num">≈ <b>{fmtInt(x.amount)} {UNIT_LABEL[x.unit]}</b> de {x.food.name} <span className="text-muted">(+{fmtInt(x.kcal)} kcal)</span></li>)}
          </ul>
        </>
      )}
      <p className="mt-2 text-xs text-muted">Sugestão de referência, não prescrição. Nada é registrado sozinho.</p>
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

type NutritionTab = 'day' | 'meals' | 'recipes' | 'foods';
const TAB_KEY = 'ca27-nutrition-tab';

function SplitsSheet({ onClose }: { onClose: () => void }) {
  const settings = useSettingsOrDefault();
  const save = useSave();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(effectiveSplits(settings.meals, settings.mealSplits)).map(([k, v]) => [k, String(v)])));
  const total = settings.meals.reduce((a, m) => a + (parseDecimal(vals[m.label] ?? '') ?? 0), 0);
  return (
    <Sheet open onClose={onClose} title="Metas por refeição"
      footer={<div className="space-y-2">
        <p className={cx('num text-center text-sm font-semibold', Math.abs(total - 100) < 0.5 ? 'text-ok' : 'text-warn')}>Total: {fmt(total, 0)}% {Math.abs(total - 100) < 0.5 ? '✔' : '(precisa somar 100%)'}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setVals(Object.fromEntries(Object.entries(defaultSplits(settings.meals)).map(([k, v]) => [k, String(v)])))}>Padrão</Button>
          <Button className="flex-1" disabled={Math.abs(total - 100) >= 0.5} onClick={async () => {
            const ok = await save(() => updateSettings({ mealSplits: Object.fromEntries(settings.meals.map((m) => [m.label, parseDecimal(vals[m.label] ?? '') ?? 0])) }).then(() => true), 'Divisão das metas salva');
            if (ok) onClose();
          }}>Salvar</Button>
        </div>
      </div>}>
      <p className="mb-3 text-sm text-muted">Quanto da meta do dia (kcal e macros) cabe em cada refeição. Use para saber quanto comer em cada uma — inclusive de uma receita.</p>
      <ul className="space-y-2">
        {settings.meals.map((m) => (
          <li key={m.label} className="flex items-center gap-3 rounded-2xl border border-line p-3">
            <span className="text-accent"><MealIcon label={m.label} /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{m.label}</span><span className="text-xs text-muted">{m.time}</span></span>
            <TextInput aria-label={`Percentual de ${m.label}`} inputMode="decimal" value={vals[m.label] ?? ''} onChange={(e) => setVals({ ...vals, [m.label]: e.target.value })} className="num !w-20 text-right" />
            <span className="text-sm text-muted">%</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Refeições e horários são editados em Perfil → Refeições.</p>
    </Sheet>
  );
}

function DateNav({ day, today, setDate }: { day: string; today: string; setDate: (d: string | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" aria-label="Dia anterior" onClick={() => setDate(addDays(day, -1))}>‹</Button>
      <TextInput type="date" aria-label="Escolher dia" value={day} onChange={(e) => e.target.value && setDate(e.target.value)} className="flex-1 text-center" />
      <Button variant="secondary" aria-label="Próximo dia" onClick={() => setDate(addDays(day, 1))}>›</Button>
      {day !== today && <Button variant="ghost" onClick={() => setDate(null)}>Hoje</Button>}
    </div>
  );
}

export function Nutrition() {
  const today = useToday();
  const settings = useSettingsOrDefault();
  const profile = useProfile();
  const { open } = useSheets();
  const [tab, setTabState] = useState<NutritionTab>(() => { try { return (sessionStorage.getItem(TAB_KEY) as NutritionTab) || 'meals'; } catch { return 'meals'; } });
  const setTab = (t: NutritionTab) => { setTabState(t); try { sessionStorage.setItem(TAB_KEY, t); } catch { /* sem armazenamento */ } };
  const [date, setDate] = useState<string | null>(null);
  const [splitsOpen, setSplitsOpen] = useState(false);
  const day = date ?? today;
  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(day).toArray(), [day], [] as FoodLog[]);
  const weekLogs = useLiveQuery(() => db.foodLogs.where('date').between(addDays(today, -6), today, true, true).toArray(), [today]) ?? [];
  const water = useLiveQuery(() => db.waterEntries.where('date').equals(day).toArray(), [day]) ?? [];
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const foods = useLiveQuery(() => db.foodItems.toArray(), []) ?? [];
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? [];
  const tg = targetsForDate(targetsAll, day);
  const totals = dayTotals(logs);
  const waterTotal = water.reduce((s, w) => s + w.amountMl, 0);
  const current = latestWeight(weights);
  const weightNow = current?.weightKg ?? profile?.startWeightKg;
  const bmiNow = weightNow && profile ? bmi(weightNow, profile.heightCm) : null;
  const mts = tg ? mealTargets(settings.meals, tg, settings.mealSplits) : [];
  const extraLabels = [...new Set(logs.map((l) => l.mealLabel))].filter((l) => !settings.meals.some((m) => m.label === l));

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -6 + i));
  const byDay = new Map<string, FoodLog[]>();
  for (const l of weekLogs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const adh = nutritionAdherence(last7, byDay, targetsAll);

  return (
    <Page title="Alimentação" subtitle={formatLongBR(day)}
      action={<Button className="!px-3" onClick={() => open({ kind: 'food', date: day })}>+ Alimento</Button>}>
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Peso" value={fmt(weightNow, weightNow && weightNow % 1 ? 1 : 0)} unit="kg" sub={current ? undefined : 'referência'} />
        <StatTile label="Altura" value={profile ? fmtInt(profile.heightCm) : '—'} unit="cm" />
        <StatTile label="IMC" value={fmt(bmiNow)} tone="accent" sub="não mede composição" />
      </div>
      <Tabs label="Seções da alimentação" value={tab} onChange={setTab} options={[{ value: 'day', label: 'Dia' }, { value: 'meals', label: 'Refeições' }, { value: 'recipes', label: 'Receitas' }, { value: 'foods', label: 'Alimentos' }]} />

      {(tab === 'day' || tab === 'meals') && <DateNav day={day} today={today} setDate={setDate} />}

      {tab === 'meals' && (
        <Card title={weekdayName(weekday(day))} subtitle={day === today ? 'Refeições de hoje' : formatBR(day)} icon={<MealIcon label="almoço" />}
          action={<Button variant="ghost" className="!px-2 !text-[12px]" onClick={() => setSplitsOpen(true)}>Metas %</Button>}>
          <ul className="space-y-2.5">
            {[...settings.meals.map((m) => m.label), ...extraLabels, 'Extras'].filter((v, i, a) => a.indexOf(v) === i).map((label) => {
              const slot = settings.meals.find((m) => m.label === label);
              const mt = mts.find((m) => m.label === label);
              const items = logs.filter((l) => l.mealLabel === label);
              if (label === 'Extras' && !items.length) return null;
              const t = dayTotals(items);
              const st = mealStatus(t.kcal, t.hasEntries, mt?.kcal ?? 0);
              const isNext = day === today && slot && !t.hasEntries && slot.label === suggestMeal(settings.meals, timeInTimeZone(new Date(), settings.timeZone));
              return (
                <li key={label}>
                  <button type="button" onClick={() => open({ kind: 'meal', date: day, meal: label })} aria-label={`${label}: ${STATUS_TEXT[st]}${t.hasEntries ? `, ${fmtInt(t.kcal)} kcal` : ''}`}
                    className={cx('flex w-full items-center gap-4 rounded-3xl border px-4 py-4 text-left transition', isNext ? 'border-accent/50 bg-card2' : 'border-line')}>
                    <span className={cx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border', isNext || t.hasEntries ? 'border-accent/40 text-accent' : 'border-line text-muted')}><MealIcon label={label} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="display block text-[21px] font-semibold leading-tight">{label}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-muted"><IconClock /><span className="num text-sm font-semibold tracking-[0.15em]">{slot?.time ?? '—'}</span></span>
                      {mt && (
                        <span className="mt-2 block">
                          <span className="num text-xs"><b className="text-fg">{t.hasEntries ? fmtInt(t.kcal) : 0}</b><span className="text-muted"> / {fmtInt(mt.kcal)} kcal · P {t.hasEntries ? fmtInt(t.proteinG) : 0}/{fmtInt(mt.proteinG)} g</span></span>
                          <span className="mt-1 block"><ProgressBar label={`Calorias de ${label}`} value={t.kcal} max={mt.kcal} tone={st === 'above' ? 'warn' : 'accent'} valueText={`${fmtInt(t.kcal)} de ${fmtInt(mt.kcal)} kcal`} /></span>
                        </span>
                      )}
                    </span>
                    <span className={isNext ? 'text-accent' : 'text-muted'}><IconChevron /></span>
                  </button>
                </li>
              );
            })}
          </ul>
          {tg && <p className="mt-3 text-xs text-muted">Metas do dia ({fmtInt(tg.caloriesKcal)} kcal · P {fmtInt(tg.proteinG)} g) divididas entre as refeições. Toque em “Metas %” para ajustar.</p>}
        </Card>
      )}

      {tab === 'day' && (
        <>
          <Card title="Total do dia" icon="🔥">
            <KcalHeadline totals={totals} targets={tg} />
            <div className="mt-4"><MacroBars totals={totals} targets={tg} /></div>
            {tg && totals.hasEntries && <CloseTheDay totals={totals} targets={tg} foods={foods} />}
            {tg && <p className="mt-3 text-xs text-muted">Meta vigente desde {formatBR(tg.effectiveDate)}: {fmtInt(tg.caloriesKcal)} kcal · P {fmtInt(tg.proteinG)} g · C {fmtInt(tg.carbsG)} g · G {fmtInt(tg.fatG)} g.</p>}
          </Card>
          <Button variant="secondary" className="w-full" onClick={() => open({ kind: 'plate', date: day })}><IconPlate /> Montar prato com meus alimentos</Button>
          <Card title="Água" icon="💧" action={<Button variant="ghost" onClick={() => open({ kind: 'water', date: day })}>+ Água</Button>}>
            <p className="num text-2xl font-bold">{fmtInt(waterTotal)} <span className="text-sm font-medium text-muted">ml {tg ? `· referência ${fmtInt(tg.waterMinMl)}–${fmtInt(tg.waterMaxMl)} ml` : ''}</span></p>
            {tg && <div className="mt-2"><ProgressBar label="Água" value={waterTotal} max={tg.waterMinMl} valueText={`${fmtInt(waterTotal)} ml`} /></div>}
          </Card>
          <Card title="Últimos 7 dias" icon="📅">
            <ul className="grid grid-cols-7 gap-1 text-center">
              {last7.map((d) => {
                const t = dayTotals(byDay.get(d) ?? []);
                const tgd = targetsForDate(targetsAll, d);
                const hit = t.hasEntries && tgd && t.proteinG >= tgd.proteinG;
                return (
                  <li key={d}>
                    <button type="button" onClick={() => setDate(d)} className={cx('w-full rounded-xl border px-0.5 py-2 text-xs', d === day ? 'border-accent' : 'border-line')}
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
          <Alert tone="info">Sem moralizar alimentos: degustações, doces, bebidas, óleos e molhos entram em “Extras” como qualquer outro registro.</Alert>
        </>
      )}

      {tab === 'recipes' && <RecipesTab day={day} />}
      {tab === 'foods' && <FoodsTab day={day} />}
      {splitsOpen && <SplitsSheet onClose={() => setSplitsOpen(false)} />}
    </Page>
  );
}
