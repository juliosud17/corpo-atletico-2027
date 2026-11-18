import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, ProgressBar, cx } from '../../components/ui';
import { WeightChart } from '../../components/charts/WeightChart';
import { useProfile, useSettingsOrDefault, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { dayTotals, expectedWeightOn, fmt, fmtInt, latestWeight, progressToGoal, reviewTrend, targetsForDate } from '../../domain/calculations';
import { addDays, diffDays, formatBR, formatLongBR, weekStartMonday, weekday, weekdayName } from '../../domain/dates';
import { HabitList } from '../habits/Checklist';
import { KcalHeadline, MacroBars } from '../nutrition/Nutrition';
import { STATUS_LABEL } from '../workouts/WorkoutLogSheet';

function greeting(h: number) { return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }

const ENCOURAGEMENT = [
  'Consistência vale mais que perfeição.',
  'Um registro de cada vez já é progresso.',
  'Compare médias semanais, não um dia isolado.',
  'Dias fora do plano fazem parte do caminho.',
  'Cuide do sono: ele ajuda em tudo.',
];

export function Today() {
  const today = useToday();
  const profile = useProfile();
  const settings = useSettingsOrDefault();
  const { open } = useSheets();
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? [];
  const milestones = useLiveQuery(() => db.milestones.toArray(), []) ?? [];
  const logs = useLiveQuery(() => db.foodLogs.where('date').equals(today).toArray(), [today]) ?? [];
  const water = useLiveQuery(() => db.waterEntries.where('date').equals(today).toArray(), [today]) ?? [];
  const targetsAll = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const plans = useLiveQuery(() => db.workoutPlans.toArray(), []) ?? [];
  const sessionsToday = useLiveQuery(() => db.workouts.where('date').equals(today).toArray(), [today]) ?? [];
  const recoveryToday = useLiveQuery(() => db.recovery.where('date').equals(today).first(), [today]);
  const weekWeights = weights.filter((w) => w.date >= weekStartMonday(today) && w.date <= today).length;

  if (!profile) return null;
  const current = latestWeight(weights);
  const prog = current ? progressToGoal(profile.startWeightKg, current.weightKg, profile.goalWeightKg) : null;
  const tg = targetsForDate(targetsAll, today);
  const totals = dayTotals(logs);
  const waterTotal = water.reduce((s, w) => s + w.amountMl, 0);
  const expected = expectedWeightOn(milestones, today);
  const trend = reviewTrend(weights, today);
  const daysToTarget = diffDays(profile.targetDate, today);
  const hour = new Date().getHours();
  const isDay17 = today.endsWith('-17');

  // Próximo treino (hoje ou próximos 6 dias, ignorando descanso)
  let next: { date: string; plan: (typeof plans)[number] } | null = null;
  for (let i = 0; i < 7 && !next; i++) {
    const d = addDays(today, i);
    const p = plans.find((x) => x.weekday === weekday(d) && x.type !== 'rest');
    if (p && !(i === 0 && sessionsToday.some((s) => s.planId === p.id))) next = { date: d, plan: p };
  }
  const cleared = profile.medicalClearanceConfirmed;

  const pending: string[] = [];
  if (!current || current.date !== today) { if (weekWeights < 3) pending.push(`pesagem (${weekWeights}/3 na semana)`); }
  if (!totals.hasEntries) pending.push('alimentação');
  if (waterTotal === 0) pending.push('água');
  if (!recoveryToday) pending.push('como estou hoje');

  const quick = [
    { label: 'Registrar peso', icon: '⚖️', run: () => open({ kind: 'weight' }) },
    { label: 'Adicionar alimento', icon: '🍽️', run: () => open({ kind: 'food' }) },
    { label: 'Registrar treino', icon: '🏋️', run: () => open({ kind: 'workout' }) },
    { label: 'Registrar água', icon: '💧', run: () => open({ kind: 'water' }) },
    { label: 'Medir cintura', icon: '📏', run: () => open({ kind: 'measure' }) },
    { label: 'Como me sinto', icon: '🙂', run: () => open({ kind: 'recovery' }) },
  ];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-safe">
      <header className="pb-4 pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Corpo Atlético 2027</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{greeting(hour)}, {profile.displayName}</h1>
        <p className="text-sm text-muted first-letter:uppercase">{formatLongBR(today)}</p>
      </header>

      <div className="space-y-4">
        {settings.trackingPaused && <Alert tone="info" title="Acompanhamento pausado">Seu histórico está guardado. Retome quando quiser em Perfil.</Alert>}

        {settings.showWeight && (
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{current ? `Peso atual · ${formatBR(current.date)}` : 'Peso de referência inicial'}</p>
                <p className="num text-4xl font-extrabold leading-tight">{fmt(current?.weightKg ?? profile.startWeightKg)}<span className="text-lg font-semibold text-muted"> kg</span></p>
                <p className="num text-sm text-muted">{fmt(profile.startWeightKg)} → {fmt(profile.goalWeightKg)} kg · até {formatBR(profile.targetDate)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">Avanço</p>
                <p className="num text-2xl font-bold">{prog ? `${fmt(prog.percentClamped)}%` : '—'}</p>
                {prog && <p className="num text-xs text-muted">{prog.changeKg >= 0 ? '−' : '+'}{fmt(Math.abs(prog.changeKg))} kg</p>}
              </div>
            </div>
            <div className="mt-3"><ProgressBar label="Avanço até a meta" value={prog?.percentClamped ?? 0} valueText={prog ? `${fmt(prog.percentClamped)}% do caminho` : 'sem pesagem'} /></div>
            {!current && <p className="mt-2 text-xs text-muted">{fmt(profile.startWeightKg)} kg é a referência inicial do plano — ainda não há pesagem registrada.</p>}
            {prog?.aboveStart && <p className="mt-2 text-xs text-muted">Peso acima do inicial: avanço 0% (variação real +{fmt(Math.abs(prog.changeKg))} kg). Oscilações acontecem.</p>}
            <div className="mt-3"><WeightChart compact weights={weights} milestones={milestones} from={addDays(today, -27)} to={addDays(today, 14)} height={150} /></div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{expected.status === 'in_plan' && expected.valueKg !== null ? `Referência hoje: ${fmt(expected.valueKg)} kg` : ''}{daysToTarget > 0 ? ` · faltam ${daysToTarget} dias` : ''}</span>
              <Link to="/evolucao" className="font-semibold text-accent">Evolução ›</Link>
            </div>
          </Card>
        )}

        {pending.length > 0 && !settings.trackingPaused && (
          <Card title="Ainda falta registrar hoje">
            <p className="text-[15px]">{pending.join(' · ')}</p>
          </Card>
        )}

        <section aria-label="Ações rápidas" className="grid grid-cols-3 gap-2">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={q.run}
              className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-card px-1 py-3 text-center text-xs font-medium hover:bg-card2">
              <span aria-hidden className="text-2xl">{q.icon}</span>{q.label}
            </button>
          ))}
        </section>

        {isDay17 && (
          <Alert tone="info" title="Dia 17: revisão mensal">
            Confira o marco do mês em Evolução, registre a cintura e, se quiser, fotos. <button type="button" className="font-semibold text-accent underline" onClick={() => open({ kind: 'measure' })}>Medir agora</button>
          </Alert>
        )}

        {trend.kind === 'stalled' && (
          <Alert tone="info" title="Revisão sugerida (nada foi alterado)">
            A média semanal não caiu nas últimas ~{trend.weeks} semanas. Se a adesão foi boa, vale revisar porções, atividade e orientação nutricional — por exemplo, discutir um ajuste de 150–200 kcal/dia. Metas só mudam se você editar em Perfil.
          </Alert>
        )}
        {trend.kind === 'fast' && (
          <Alert tone="warn" title="Queda rápida">Média caindo mais de 1 kg/semana. Se houver fraqueza, fadiga ou piora, revise o plano com um profissional.</Alert>
        )}

        {settings.showCalories && (
          <Card title="Alimentação de hoje" action={<Link to="/alimentacao" className="text-sm font-semibold text-accent">Diário ›</Link>}>
            <KcalHeadline totals={totals} targets={tg} />
            <div className="mt-3"><MacroBars totals={totals} targets={tg} /></div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
              <span className="num text-sm">💧 {fmtInt(waterTotal)} ml {tg && <span className="text-muted">/ ref. {fmtInt(tg.waterMinMl)}–{fmtInt(tg.waterMaxMl)}</span>}</span>
              <Button variant="secondary" className="!min-h-9 !px-3 text-sm" onClick={() => open({ kind: 'water' })}>+ Água</Button>
            </div>
          </Card>
        )}

        {settings.showWorkouts && (
          <Card title="Próximo treino" action={<Link to="/treinos" className="text-sm font-semibold text-accent">Treinos ›</Link>}>
            {next ? (
              <div className="space-y-2">
                <p className="font-semibold">{next.plan.name}</p>
                <p className="text-sm text-muted first-letter:uppercase">{next.date === today ? 'Hoje' : weekdayName(weekday(next.date))} · {formatBR(next.date)}{next.plan.durationLabel ? ` · ${next.plan.durationLabel}` : ''}</p>
                <p className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', cleared ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn')}>
                  {cleared ? '✔ Liberado conforme orientação' : '⛔ Planejado / não liberado — avaliação pendente'}
                </p>
                {sessionsToday.length > 0 && <p className="text-xs text-muted">Hoje: {sessionsToday.map((s) => STATUS_LABEL[s.status]).join(', ')}</p>}
              </div>
            ) : <p className="text-sm text-muted">Nenhum treino planejado nos próximos dias.</p>}
            {!cleared && <p className="mt-2 text-xs text-muted">⚠ {profile.healthNotes ? `${profile.healthNotes}: p` : 'P'}rocure avaliação antes de treinar. Sem impacto ou cargas altas até lá.</p>}
          </Card>
        )}

        <Card title="Checklist de hoje" action={<Link to="/checklist" className="text-sm font-semibold text-accent">Tudo ›</Link>}>
          <HabitList cadence="daily" today={today} />
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Desta semana</p>
            <HabitList cadence="weekly" today={today} limit={3} />
          </div>
        </Card>

        <p className="px-2 pb-2 text-center text-sm text-muted">{ENCOURAGEMENT[(new Date().getDate()) % ENCOURAGEMENT.length]}</p>
      </div>
    </main>
  );
}
