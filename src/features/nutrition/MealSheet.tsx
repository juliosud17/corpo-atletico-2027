import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Field, Sheet, TextInput, cx, useToast } from '../../components/ui';
import { IconApple, IconBook, IconClock, IconPlate, IconRefresh, MealIcon } from '../../components/ui/icons';
import { useSave, useSettingsOrDefault } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { applyFavoriteMeal, copyMeal, saveFavoriteMeal } from '../../data/repo';
import { dayTotals, fmt, fmtInt, targetsForDate } from '../../domain/calculations';
import { addDays, localDateTimeToISO } from '../../domain/dates';
import { mealStatus, mealTargets, type MealStatus } from '../../domain/meals';
import type { FoodLog } from '../../domain/types';
import { PREP_LABEL, UNIT_LABEL } from './FoodSheet';

export const STATUS_TEXT: Record<MealStatus, string> = { empty: 'Sem registro', below: 'Abaixo da meta', on_target: 'Na meta', above: 'Acima da meta' };
export const STATUS_STYLE: Record<MealStatus, string> = {
  empty: 'border-line bg-card2 text-muted', below: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  on_target: 'border-ok/40 bg-ok-soft text-ok', above: 'border-accent/50 bg-accent-soft text-accent',
};
const STATUS_ICON: Record<MealStatus, string> = { empty: '○', below: '↘', on_target: '✔', above: '↗' };

/** Detalhe de uma refeição: meta da refeição, itens e atalhos para receitas, alimentos e prato. */
export function MealSheet({ date, meal, onClose }: { date: string; meal: string; onClose: () => void }) {
  const settings = useSettingsOrDefault();
  const { open } = useSheets();
  const save = useSave();
  const { show } = useToast();
  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(date).filter((l) => l.mealLabel === meal).toArray(), [date, meal], [] as FoodLog[]);
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const favorites = useLiveQuery(() => db.favoriteMeals.toArray(), []) ?? [];
  const [favName, setFavName] = useState('');
  const [showFav, setShowFav] = useState(false);
  const slot = settings.meals.find((m) => m.label === meal);
  const tg = targetsForDate(targetsAll, date);
  const mt = tg ? mealTargets(settings.meals, tg, settings.mealSplits).find((m) => m.label === meal) : undefined;
  const t = dayTotals(logs);
  const st = mealStatus(t.kcal, t.hasEntries, mt?.kcal ?? 0);
  const time = slot?.time ?? '12:00';
  const items = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const rows: [string, number, number | undefined][] = [
    ['Proteína', t.proteinG, mt?.proteinG], ['Carboidrato', t.carbsG, mt?.carbsG], ['Gordura', t.fatG, mt?.fatG],
  ];

  return (
    <Sheet open onClose={onClose} title={meal}
      footer={<Button className="w-full" onClick={onClose}>Pronto</Button>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-card2 text-accent"><MealIcon label={meal} /></span>
          <p className="flex items-center gap-1.5 text-muted"><IconClock /><span className="num font-semibold tracking-[0.15em]">{slot?.time ?? '—'}</span>{mt && <span className="eyebrow ml-2">{fmtInt(mt.pct)}% do dia</span>}</p>
        </div>

        <div className={cx('flex items-center justify-between gap-3 rounded-2xl border px-4 py-3', STATUS_STYLE[st])} role="status">
          <span className="text-xs font-bold uppercase tracking-[0.16em]"><span aria-hidden>{STATUS_ICON[st]} </span>{STATUS_TEXT[st]}</span>
          <span className="num text-lg"><b className="text-fg">{t.hasEntries ? fmtInt(t.kcal) : '—'}</b><span className="text-muted"> / {mt ? fmtInt(mt.kcal) : '—'} kcal</span></span>
        </div>

        <dl className="space-y-2.5">
          {rows.map(([label, v, target]) => (
            <div key={label} className="flex items-center justify-between">
              <dt className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">{label}</dt>
              <dd className="num"><b>{t.hasEntries ? fmtInt(v) : '—'}</b><span className="text-muted"> / {target !== undefined ? `${fmtInt(target)}g` : '—'}</span></dd>
            </div>
          ))}
        </dl>
        {t.itemsMissingKcal > 0 && <p className="text-xs text-warn">{t.itemsMissingKcal} item(ns) sem dados nutricionais: o total é parcial.</p>}

        <div className="border-t border-line pt-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-line text-muted"><MealIcon label={meal} /></span>
              <p className="display text-lg font-semibold">Nenhum item adicionado</p>
              <p className="text-sm text-muted">Adicione suas receitas, um prato montado ou alimentos individuais.</p>
              {slot?.reference && <p className="text-xs text-muted">Referência: {slot.reference}</p>}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((l) => (
                <li key={l.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 py-2.5 text-left" onClick={() => open({ kind: 'food', log: l })} aria-label={`Editar ${l.description}`}>
                    <span className="min-w-0 text-sm">
                      <span className="block">{l.recipeId && <span className="mr-1 text-accent">📖</span>}{l.description}</span>
                      <span className="block text-xs text-muted">{fmt(l.amount, l.amount % 1 ? 2 : 0)} {l.recipeId && l.unit === 'unit' ? 'porção(ões)' : UNIT_LABEL[l.unit]}{l.preparation ? ` · ${PREP_LABEL[l.preparation]}` : ''}</span>
                    </span>
                    <span className="num shrink-0 text-right text-xs">
                      {l.kcal !== undefined ? <span className="block font-semibold">{fmtInt(l.kcal)} kcal</span> : <span className="block text-warn">sem dados</span>}
                      {l.proteinG !== undefined && <span className="block text-muted">P {fmt(l.proteinG)} g</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Minhas receitas', icon: <IconBook />, run: () => open({ kind: 'recipePick', date, meal }) },
            { label: 'Montar prato', icon: <IconPlate />, run: () => open({ kind: 'plate', date, meal }) },
            { label: 'Alimentos', icon: <IconApple />, run: () => open({ kind: 'food', date, meal }) },
          ].map((b) => (
            <button key={b.label} type="button" onClick={b.run} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-card2/40 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] hover:border-accent">
              <span className="text-fg">{b.icon}</span>{b.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" className="!text-[12px]" onClick={async () => {
            const n = await save(() => copyMeal(addDays(date, -1), date, meal, localDateTimeToISO(date, time)));
            if (n !== undefined) show(n ? `${n} item(ns) copiado(s) de ontem` : 'Ontem não há itens nesta refeição', n ? 'ok' : 'info');
          }}><IconRefresh /> Repetir ontem</Button>
          <Button variant="secondary" className="!text-[12px]" onClick={() => { setShowFav(!showFav); setFavName(`${meal} favorito`); }}>★ Favoritas</Button>
        </div>
        {showFav && (
          <div className="space-y-2 rounded-2xl border border-line p-3">
            {favorites.length > 0 && (
              <ul className="space-y-1.5">
                {favorites.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <Button variant="secondary" className="flex-1 justify-between !normal-case !tracking-normal" onClick={async () => {
                      const n = await save(() => applyFavoriteMeal(f.id, date, meal, localDateTimeToISO(date, time)), `“${f.name}” adicionada`);
                      if (n !== undefined) setShowFav(false);
                    }}><span className="truncate">{f.name}</span><span className="text-xs text-muted">{f.items.length} itens</span></Button>
                    <button type="button" className="min-h-11 px-2 text-danger" aria-label={`Excluir favorita ${f.name}`} onClick={() => save(() => db.favoriteMeals.delete(f.id), 'Favorita excluída')}>🗑️</button>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 0 && (
              <div className="flex items-end gap-2">
                <Field label="Salvar esta refeição como favorita" className="flex-1">{(id) => <TextInput id={id} value={favName} onChange={(e) => setFavName(e.target.value)} />}</Field>
                <Button onClick={async () => { const n = await save(() => saveFavoriteMeal(favName.trim() || meal, date, meal), 'Favorita salva'); if (n) setShowFav(false); }}>Salvar</Button>
              </div>
            )}
            {favorites.length === 0 && items.length === 0 && <p className="text-sm text-muted">Registre itens nesta refeição e salve como favorita para repetir depois.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
