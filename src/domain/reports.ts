// Resumos semanais/mensais, CSV e lembretes (Fase 3). Funções puras, sem efeitos colaterais.
import { dayTotals, expectedWeightOn, targetsForDate, weeklyAverages } from './calculations';
import { addDays, diffDays, weekStartMonday, weekday } from './dates';
import { exerciseHistory } from './workouts';
import type {
  BodyMeasurement, ExerciseSet, FoodLog, GoalMilestone, ISODate, NutritionTargets, ProgressPhoto, RecoveryEntry,
  ReminderSettings, ReviewLogEntry, WeightEntry, WorkoutPlan, WorkoutSession,
} from './types';

export interface ReportData {
  weights: WeightEntry[];
  foodLogs: FoodLog[];
  targets: NutritionTargets[];
  workouts: WorkoutSession[];
  plans: WorkoutPlan[];
  sets: ExerciseSet[];
  recovery: RecoveryEntry[];
  measurements: BodyMeasurement[];
  milestones: GoalMilestone[];
  photos: ProgressPhoto[];
}

const inRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface PeriodNutrition {
  daysInPeriod: number;
  daysLogged: number;
  /** Médias calculadas SOMENTE nos dias registrados. */
  avgKcal: number | null;
  avgProteinG: number | null;
  avgCarbsG: number | null;
  avgFatG: number | null;
  daysProteinHit: number;
  daysWithMissingData: number;
}

export function periodNutrition(logs: FoodLog[], targets: NutritionTargets[], from: ISODate, to: ISODate): PeriodNutrition {
  const byDay = new Map<ISODate, FoodLog[]>();
  for (const l of logs) if (inRange(l.date, from, to)) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l]);
  const totals = [...byDay.entries()].map(([d, ls]) => ({ d, t: dayTotals(ls) }));
  let hit = 0;
  for (const { d, t } of totals) { const tg = targetsForDate(targets, d); if (tg && t.proteinG >= tg.proteinG) hit++; }
  return {
    daysInPeriod: diffDays(to, from) + 1,
    daysLogged: totals.length,
    avgKcal: avg(totals.map(({ t }) => t.kcal)),
    avgProteinG: avg(totals.map(({ t }) => t.proteinG)),
    avgCarbsG: avg(totals.map(({ t }) => t.carbsG)),
    avgFatG: avg(totals.map(({ t }) => t.fatG)),
    daysProteinHit: hit,
    daysWithMissingData: totals.filter(({ t }) => t.itemsMissingKcal > 0).length,
  };
}

export interface PeriodTraining {
  completed: number;
  partial: number;
  notCleared: number;
  postponedOrCancelled: number;
  planned: number;
  cardioMinutes: number;
  sets: number;
  sessionsWithPain: number;
}

export function periodTraining(workouts: WorkoutSession[], plans: WorkoutPlan[], sets: ExerciseSet[], from: ISODate, to: ISODate): PeriodTraining {
  const ws = workouts.filter((w) => !w.inProgress && inRange(w.date, from, to));
  const ids = new Set(ws.map((w) => w.id));
  const periodSets = sets.filter((s) => ids.has(s.sessionId));
  let planned = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (plans.some((p) => p.weekday === weekday(d) && p.type !== 'rest')) planned++;
  return {
    completed: ws.filter((w) => w.status === 'completed').length,
    partial: ws.filter((w) => w.status === 'partial').length,
    notCleared: ws.filter((w) => w.status === 'not_cleared').length,
    postponedOrCancelled: ws.filter((w) => w.status === 'postponed' || w.status === 'cancelled').length,
    planned,
    cardioMinutes: ws.filter((w) => w.status === 'completed' || w.status === 'partial').reduce((a, w) => a + (w.cardioMinutes ?? 0), 0),
    sets: periodSets.length,
    sessionsWithPain: new Set(periodSets.filter((s) => s.pain).map((s) => s.sessionId)).size + ws.filter((w) => w.discomfort && !periodSets.some((s) => s.sessionId === w.id && s.pain)).length,
  };
}

export interface WeeklySummary {
  weekStart: ISODate; weekEnd: ISODate;
  weightAvg: number | null; weightCount: number;
  deltaVsPrevious: number | null;
  nutrition: PeriodNutrition;
  training: PeriodTraining;
  sleepAvg: number | null; sleepCount: number;
  latestWaist: { date: ISODate; cm: number } | null;
  notes: { date: ISODate; text: string }[];
}

export function latestWaist(measurements: BodyMeasurement[], upTo: ISODate): { date: ISODate; cm: number } | null {
  const m = measurements.filter((x) => x.waistCm !== undefined && x.measuredOn <= upTo).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn))[0];
  return m ? { date: m.measuredOn, cm: m.waistCm! } : null;
}

export function weeklySummary(data: ReportData, anyDateInWeek: ISODate): WeeklySummary {
  const ws = weekStartMonday(anyDateInWeek), we = addDays(ws, 6);
  const weeks = weeklyAverages(data.weights);
  const cur = weeks.find((w) => w.weekStart === ws);
  const prev = weeks.find((w) => w.weekStart === addDays(ws, -7));
  const rec = data.recovery.filter((r) => inRange(r.date, ws, we));
  const sleep = rec.map((r) => r.sleepHours).filter((v): v is number => typeof v === 'number');
  const notes = [
    ...rec.filter((r) => r.note?.trim()).map((r) => ({ date: r.date, text: r.note!.trim() })),
    ...data.weights.filter((w) => inRange(w.date, ws, we) && w.note?.trim()).map((w) => ({ date: w.date, text: `Peso: ${w.note!.trim()}` })),
    ...data.workouts.filter((w) => inRange(w.date, ws, we) && w.notes?.trim()).map((w) => ({ date: w.date, text: `Treino: ${w.notes!.trim()}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return {
    weekStart: ws, weekEnd: we,
    weightAvg: cur?.averageKg ?? null, weightCount: cur?.count ?? 0,
    deltaVsPrevious: cur && prev ? cur.averageKg - prev.averageKg : null,
    nutrition: periodNutrition(data.foodLogs, data.targets, ws, we),
    training: periodTraining(data.workouts, data.plans, data.sets, ws, we),
    sleepAvg: avg(sleep), sleepCount: sleep.length,
    latestWaist: latestWaist(data.measurements, we),
    notes,
  };
}

export interface ExerciseProgress { name: string; firstLoad: number; lastLoad: number; sessions: number }

export interface MonthlySummary {
  month: string; from: ISODate; to: ISODate;
  /** Marco de referência no dia 17 do mês (ou fim do mês se não houver dia 17 no plano). */
  checkpoint: ISODate;
  expectedAtCheckpoint: number | null;
  /** Média das pesagens em ±3 dias do dia 17. */
  weightNearCheckpoint: number | null; weightNearCount: number;
  monthWeightAvg: number | null; monthWeightCount: number;
  waist: { date: ISODate; cm: number } | null;
  waistPrevious: { date: ISODate; cm: number } | null;
  realPhotos: number;
  /** Dias com pelo menos um registro de qualquer tipo / dias do mês até hoje. */
  daysWithAnyRecord: number; daysElapsed: number;
  nutrition: PeriodNutrition;
  training: PeriodTraining;
  exerciseProgress: ExerciseProgress[];
}

export function monthlySummary(data: ReportData, month: string, today: ISODate): MonthlySummary {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const checkpoint = `${month}-17`;
  const near = data.weights.filter((w) => Math.abs(diffDays(w.date, checkpoint)) <= 3);
  const monthW = data.weights.filter((w) => inRange(w.date, from, to));
  const lastDay = today < to ? today : to;
  const daysElapsed = lastDay < from ? 0 : diffDays(lastDay, from) + 1;
  const recordDays = new Set<ISODate>([
    ...data.weights.map((x) => x.date), ...data.foodLogs.map((x) => x.date), ...data.workouts.map((x) => x.date),
    ...data.recovery.map((x) => x.date), ...data.measurements.map((x) => x.measuredOn),
  ].filter((d) => inRange(d, from, lastDay)));
  const ids = new Set(data.workouts.filter((w) => inRange(w.date, from, to)).map((w) => w.id));
  const names = [...new Set(data.sets.filter((s) => ids.has(s.sessionId)).map((s) => s.exerciseName))];
  const exerciseProgress: ExerciseProgress[] = [];
  for (const n of names) {
    const h = exerciseHistory(n, data.sets, data.workouts).filter((x) => inRange(x.date, from, to) && x.maxLoadKg !== null);
    if (h.length >= 2) exerciseProgress.push({ name: n, firstLoad: h[0].maxLoadKg!, lastLoad: h[h.length - 1].maxLoadKg!, sessions: h.length });
  }
  const waist = (() => { const w = latestWaist(data.measurements, to); return w && w.date >= from ? w : null; })();
  // Medida anterior = a última antes da cintura do mês (pode ser no mesmo mês ou antes).
  const waistPrevious = latestWaist(data.measurements, addDays(waist?.date ?? from, -1));
  return {
    month, from, to, checkpoint,
    expectedAtCheckpoint: (() => { const e = expectedWeightOn(data.milestones, checkpoint); return e.status === 'before_plan' ? null : e.valueKg; })(),
    weightNearCheckpoint: avg(near.map((w) => w.weightKg)), weightNearCount: near.length,
    monthWeightAvg: avg(monthW.map((w) => w.weightKg)), monthWeightCount: monthW.length,
    waist, waistPrevious,
    realPhotos: data.photos.filter((p) => p.photoKind === 'real' && inRange(p.capturedOn, from, to)).length,
    daysWithAnyRecord: recordDays.size, daysElapsed,
    nutrition: periodNutrition(data.foodLogs, data.targets, from, to),
    training: periodTraining(data.workouts, data.plans, data.sets, from, to),
    exerciseProgress: exerciseProgress.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

// Revisão de 14–21 dias -------------------------------------------------------------------------
export type ReviewStatus = { due: boolean; daysSince: number | null; lastDate: ISODate | null; overdue: boolean };

export function reviewStatus(log: ReviewLogEntry[] | undefined, startDate: ISODate, today: ISODate): ReviewStatus {
  const last = [...(log ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
  const ref = last ?? startDate;
  const days = diffDays(today, ref);
  return { due: days >= 14, overdue: days > 21, daysSince: last ? days : null, lastDate: last };
}


// CSV (pt-BR: separador ";" e vírgula decimal, compatível com Excel/Numbers) -------------------
export function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : String(v);
  // Evita injeção de fórmulas ao abrir no Excel.
  if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: unknown[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

// Lembretes dentro do app ---------------------------------------------------------------------------
export interface Reminder { id: string; text: string; action?: 'weight' | 'food' | 'workout' | 'measure' | 'review' }

export interface ReminderInput {
  today: ISODate;
  nowHHMM: string;
  settings: ReminderSettings;
  weighInDays?: number[]; // dias da semana (0–6) sugeridos para pesar
  weightsThisWeek: number;
  weighedToday: boolean;
  meals: { label: string; time: string }[];
  loggedMeals: string[];
  plannedWorkoutToday: { name: string; requiresClearance: boolean } | null;
  workoutLoggedToday: boolean;
  cleared: boolean;
  waistThisMonth: boolean;
  review: ReviewStatus;
  paused: boolean;
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export function dueReminders(i: ReminderInput): Reminder[] {
  if (i.paused) return [];
  const out: Reminder[] = [];
  const now = toMin(i.nowHHMM);
  const wd = weekday(i.today);
  const weighDays = i.weighInDays ?? [1, 3, 5];
  if (i.settings.weighIn && !i.weighedToday && i.weightsThisWeek < 3 && weighDays.includes(wd) && now < 12 * 60) {
    out.push({ id: 'weigh', text: `Dia de pesagem (${i.weightsThisWeek}/3 na semana): de manhã, após ir ao banheiro e antes de comer.`, action: 'weight' });
  }
  if (i.settings.meals) {
    // Refeição cujo horário passou há até 2 h e ainda não tem registro (ignora horários depois da meia-noite).
    const late = i.meals.filter((m) => { const t = toMin(m.time); return t >= 5 * 60 && now >= t && now - t <= 120 && !i.loggedMeals.includes(m.label); });
    for (const m of late) out.push({ id: `meal-${m.label}`, text: `${m.label} (${m.time}) ainda sem registro.`, action: 'food' });
  }
  if (i.settings.workouts && i.plannedWorkoutToday && !i.workoutLoggedToday) {
    out.push({ id: 'workout', text: i.plannedWorkoutToday.requiresClearance && !i.cleared
      ? `Hoje: ${i.plannedWorkoutToday.name} (planejado / não liberado).`
      : `Hoje: ${i.plannedWorkoutToday.name}.`, action: 'workout' });
  }
  const day = Number(i.today.slice(8));
  if (i.settings.monthly && !i.waistThisMonth && day >= 17) {
    out.push({ id: 'monthly', text: day === 17 ? 'Dia 17: medir cintura e, se quiser, fotos.' : 'Medição mensal (dia 17) ainda não registrada neste mês.', action: 'measure' });
  }
  if (i.settings.review && i.review.due) {
    out.push({ id: 'review', text: i.review.lastDate ? `Revisão de tendência: ${i.review.daysSince} dias desde a última.` : 'Hora da primeira revisão de tendência (a cada 14–21 dias).', action: 'review' });
  }
  return out;
}

export const DEFAULT_REMINDERS: ReminderSettings = { weighIn: true, meals: true, workouts: true, monthly: true, review: true };
