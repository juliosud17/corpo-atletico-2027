import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, EmptyState, Field, Page, Segmented, Select, Sheet, TextInput, cx } from '../../components/ui';
import { useSave, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteHabit, periodKeyFor, saveHabit, setHabitCompletion } from '../../data/repo';
import { dayTotals, fmt, fmtInt, targetsForDate } from '../../domain/calculations';
import { addDays, formatShortBR, monthKey, monthLabel, weekStartMonday } from '../../domain/dates';
import type { Cadence, FoodLog, HabitDefinition } from '../../domain/types';

const CADENCE_LABEL: Record<Cadence, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };

/** Textos de apoio calculados dos registros — informativos, nunca marcam a tarefa sozinhos. */
export function useHabitHints(today: string) {
  const ws = weekStartMonday(today);
  const we = addDays(ws, 6);
  const mk = monthKey(today);
  return useLiveQuery(async () => {
    const [weights, logs, water, targets, rec, meas] = await Promise.all([
      db.weights.where('date').between(ws, we, true, true).count(),
      db.foodLogs.where('date').between(ws, we, true, true).toArray(),
      db.waterEntries.where('date').equals(today).toArray(),
      db.targets.toArray(),
      db.recovery.where('date').equals(today).first(),
      db.measurements.where('measuredOn').between(`${mk}-01`, `${mk}-31`, true, true).toArray(),
    ]);
    const byDay = new Map<string, FoodLog[]>();
    for (const l of logs) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
    let protDays = 0;
    for (const [d, ls] of byDay) { const t = targetsForDate(targets, d); if (t && dayTotals(ls).proteinG >= t.proteinG) protDays++; }
    const tgToday = targetsForDate(targets, today);
    const waterMl = water.reduce((s, w) => s + w.amountMl, 0);
    const hints: Record<NonNullable<HabitDefinition['hint']>, string> = {
      weights_week: `Pesagens nesta semana: ${weights} de 3`,
      food_days_week: `Dias com alimentação registrada: ${byDay.size} de 7`,
      protein_days_week: `Meta de proteína nos dias registrados: ${protDays} de ${byDay.size}`,
      waist_month: meas.some((m) => m.waistCm !== undefined) ? 'Cintura medida neste mês' : 'Cintura ainda não medida neste mês',
      water_today: tgToday ? `Água hoje: ${fmtInt(waterMl)} ml (referência ${fmtInt(tgToday.waterMinMl)}–${fmtInt(tgToday.waterMaxMl)})` : `Água hoje: ${fmtInt(waterMl)} ml`,
      sleep: rec?.sleepHours !== undefined ? `Sono registrado: ${fmt(rec.sleepHours)} h` : 'Sono de hoje não registrado',
    };
    return hints;
  }, [today, ws, we, mk]);
}

export function HabitList({ cadence, today, limit }: { cadence: Cadence; today: string; limit?: number }) {
  const save = useSave();
  const habits = useLiveQuery(() => db.habits.where('cadence').equals(cadence).toArray(), [cadence]) ?? [];
  const period = periodKeyFor(cadence, today);
  const done = useLiveQuery(() => db.completions.where('periodKey').equals(period).toArray(), [period]) ?? [];
  const hints = useHabitHints(today);
  // Estado otimista: a marcação aparece na hora e é confirmada pelo banco em seguida.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const active = habits.filter((h) => h.active).sort((a, b) => a.order - b.order).slice(0, limit);
  if (!active.length) return <EmptyState icon="✅">Nenhum item {CADENCE_LABEL[cadence].toLowerCase()} ativo.</EmptyState>;
  return (
    <ul className="space-y-1">
      {active.map((h) => {
        const stored = done.some((c) => c.habitId === h.id && c.completed);
        const checked = optimistic[h.id] ?? stored;
        return (
          <li key={h.id}>
            <label className={cx('flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-card2', checked && 'opacity-80')}>
              <input type="checkbox" checked={checked} className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--accent)]"
                onChange={async (e) => {
                  const v = e.target.checked;
                  setOptimistic((o) => ({ ...o, [h.id]: v }));
                  await save(() => setHabitCompletion(h, today, v), v ? 'Marcado como feito' : 'Marcação removida');
                  setOptimistic((o) => { const { [h.id]: _omit, ...rest } = o; void _omit; return rest; });
                }} />
              <span className="min-w-0">
                <span className={cx('block text-[15px]', checked && 'line-through decoration-muted')}>{h.title}</span>
                {h.hint && hints?.[h.hint] && <span className="block text-xs text-muted">{hints[h.hint]}</span>}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function HabitEditor({ habit, onClose }: { habit?: HabitDefinition; onClose: () => void }) {
  const save = useSave();
  const [title, setTitle] = useState(habit?.title ?? '');
  const [cadence, setCadence] = useState<Cadence>(habit?.cadence ?? 'daily');
  const [del, setDel] = useState(false);
  return (
    <>
      <Sheet open onClose={onClose} title={habit ? 'Editar item' : 'Novo item do checklist'}
        footer={<div className="flex gap-2">{habit && <Button variant="secondary" aria-label="Excluir item" onClick={() => setDel(true)}>🗑️</Button>}
          <Button className="flex-1" disabled={!title.trim()} onClick={async () => {
            const ok = await save(() => saveHabit({ id: habit?.id, title: title.trim(), cadence, targetCount: habit?.targetCount ?? 1, active: habit?.active ?? true, order: habit?.order ?? Date.now(), hint: habit?.cadence === cadence ? habit?.hint : undefined }).then(() => true), 'Checklist atualizado');
            if (ok) onClose();
          }}>Salvar</Button></div>}>
        <div className="space-y-4">
          <Field label="Tarefa">{(id) => <TextInput id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: caminhar 10 min após o almoço" />}</Field>
          <Field label="Frequência">{(id) => <Select id={id} value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></Select>}</Field>
        </div>
      </Sheet>
      <ConfirmDialog open={del} danger title="Excluir item?" confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { if (habit) { await save(() => deleteHabit(habit.id), 'Item excluído'); setDel(false); onClose(); } }}>
        <p>O item e suas marcações serão removidos. Para manter o histórico, prefira pausar.</p>
      </ConfirmDialog>
    </>
  );
}

export function ChecklistPage() {
  const today = useToday();
  const save = useSave();
  const [tab, setTab] = useState<Cadence>('daily');
  const [editing, setEditing] = useState<HabitDefinition | 'new' | null>(null);
  const habits = useLiveQuery(() => db.habits.orderBy('order').toArray(), []) ?? [];
  const ws = weekStartMonday(today);
  const periodText = tab === 'daily' ? 'Hoje' : tab === 'weekly' ? `Semana ${formatShortBR(ws)}–${formatShortBR(addDays(ws, 6))}` : monthLabel(monthKey(today));

  return (
    <Page title="Checklist" subtitle="Marque manualmente — nada é marcado sozinho">
      <Segmented label="Frequência" value={tab} onChange={setTab} options={[{ value: 'daily', label: 'Diário' }, { value: 'weekly', label: 'Semanal' }, { value: 'monthly', label: 'Mensal' }]} />
      <Card title={periodText}><HabitList cadence={tab} today={today} /></Card>
      <Card title="Gerenciar itens" action={<Button variant="ghost" onClick={() => setEditing('new')}>+ Novo</Button>}>
        <ul className="divide-y divide-line">
          {habits.filter((h) => h.cadence === tab).map((h) => (
            <li key={h.id} className="flex items-center gap-2 py-2">
              <button type="button" className="min-w-0 flex-1 text-left text-sm" onClick={() => setEditing(h)}>
                <span className={cx('block truncate', !h.active && 'text-muted')}>{h.title}</span>
                {!h.active && <span className="text-xs text-muted">pausado</span>}
              </button>
              <Button variant="secondary" className="!min-h-9 !px-3 text-sm" onClick={() => save(() => saveHabit({ ...h, active: !h.active }), h.active ? 'Item pausado' : 'Item reativado')}>{h.active ? 'Pausar' : 'Retomar'}</Button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Pausar mantém o histórico. Não há contagem de falhas nem mensagens de culpa.</p>
      </Card>
      {editing && <HabitEditor habit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}
