// Funções de cálculo puras (Parte E.3 do briefing). Sem efeitos colaterais.
import { diffDays, toDayNumber, weekStartMonday, fromDayNumber } from './dates';
import type {
  FoodItem, FoodLog, GoalMilestone, ISODate, NutritionTargets, Sex, Unit, WeightEntry,
} from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// 1. IMC -------------------------------------------------------------------
export function bmi(weightKg: number, heightCm: number): number | null {
  if (!isNum(weightKg) || !isNum(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  return weightKg / (heightCm / 100) ** 2;
}

// 2. TMB (Mifflin-St Jeor) -------------------------------------------------
export function bmrMifflinStJeor(p: { weightKg: number; heightCm: number; age?: number; sex: Sex }): number | null {
  if (!isNum(p.weightKg) || !isNum(p.heightCm) || !isNum(p.age) || p.weightKg <= 0 || p.heightCm <= 0 || p.age <= 0) return null;
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  if (p.sex === 'male') return base + 5;
  if (p.sex === 'female') return base - 161;
  return null; // sem sexo informado não há fórmula aplicável
}

// 3. kcal a partir de macros ------------------------------------------------
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return proteinG * 4 + carbsG * 4 + fatG * 9;
}

// 6. Progresso até a meta ----------------------------------------------------
export interface Progress {
  /** null quando início e meta são iguais (sem caminho a percorrer). */
  percentRaw: number | null;
  /** Limitado a 0–100 para a barra. */
  percentClamped: number;
  /** Variação real (positivo = perdeu peso, quando a meta é reduzir). */
  changeKg: number;
  direction: 'lose' | 'gain' | 'none';
  aboveStart: boolean;
}

export function progressToGoal(startKg: number, currentKg: number, goalKg: number): Progress {
  const total = startKg - goalKg;
  const direction: Progress['direction'] = total > 0 ? 'lose' : total < 0 ? 'gain' : 'none';
  if (total === 0 || !isNum(total)) {
    return { percentRaw: null, percentClamped: 0, changeKg: startKg - currentKg, direction: 'none', aboveStart: false };
  }
  const done = startKg - currentKg;
  const raw = (done / total) * 100;
  const clamped = Math.max(0, Math.min(100, raw));
  const aboveStart = direction === 'lose' ? currentKg > startKg : currentKg < startKg;
  return { percentRaw: raw, percentClamped: clamped, changeKg: done, direction, aboveStart };
}

// 7. Meta esperada na data (interpolação linear) ------------------------------
export type PlanStatus = 'in_plan' | 'before_plan' | 'after_plan' | 'no_plan';
export interface PlanTarget { valueKg: number | null; status: PlanStatus }

export function sortMilestones(ms: GoalMilestone[]): GoalMilestone[] {
  return [...ms].sort((a, b) => toDayNumber(a.date) - toDayNumber(b.date));
}

export function expectedWeightOn(milestones: GoalMilestone[], date: ISODate): PlanTarget {
  const ms = sortMilestones(milestones);
  if (ms.length === 0) return { valueKg: null, status: 'no_plan' };
  const d = toDayNumber(date);
  const first = ms[0], last = ms[ms.length - 1];
  if (d < toDayNumber(first.date)) return { valueKg: first.targetWeightKg, status: 'before_plan' };
  if (d > toDayNumber(last.date)) return { valueKg: last.targetWeightKg, status: 'after_plan' };
  for (let i = 0; i < ms.length - 1; i++) {
    const a = ms[i], b = ms[i + 1];
    const da = toDayNumber(a.date), db = toDayNumber(b.date);
    if (d >= da && d <= db) {
      if (db === da) return { valueKg: b.targetWeightKg, status: 'in_plan' };
      const t = (d - da) / (db - da);
      return { valueKg: a.targetWeightKg + (b.targetWeightKg - a.targetWeightKg) * t, status: 'in_plan' };
    }
  }
  return { valueKg: last.targetWeightKg, status: 'in_plan' };
}

/** Pontos da linha de metas dentro de [from, to] (inclui extremos interpolados). */
export function planLinePoints(milestones: GoalMilestone[], from: ISODate, to: ISODate): { day: number; date: ISODate; plan: number }[] {
  const ms = sortMilestones(milestones);
  if (ms.length === 0) return [];
  const f = Math.max(toDayNumber(from), toDayNumber(ms[0].date));
  const t = Math.min(toDayNumber(to), toDayNumber(ms[ms.length - 1].date));
  if (f > t) return [];
  const days = new Set<number>([f, t]);
  for (const m of ms) { const n = toDayNumber(m.date); if (n >= f && n <= t) days.add(n); }
  return [...days].sort((a, b) => a - b).map((day) => {
    const date = fromDayNumber(day);
    return { day, date, plan: expectedWeightOn(ms, date).valueKg as number };
  });
}

// 4/5. Médias semanais e variação ----------------------------------------------
export interface WeeklyAverage { weekStart: ISODate; averageKg: number; count: number }

export function weeklyAverages(entries: Pick<WeightEntry, 'date' | 'weightKg'>[]): WeeklyAverage[] {
  const map = new Map<ISODate, number[]>();
  for (const e of entries) {
    if (!isNum(e.weightKg) || e.weightKg <= 0) continue;
    const ws = weekStartMonday(e.date);
    const arr = map.get(ws) ?? [];
    arr.push(e.weightKg);
    map.set(ws, arr);
  }
  return [...map.entries()]
    .map(([weekStart, arr]) => ({ weekStart, averageKg: arr.reduce((s, v) => s + v, 0) / arr.length, count: arr.length }))
    .sort((a, b) => toDayNumber(a.weekStart) - toDayNumber(b.weekStart));
}

export function averageForWeek(entries: Pick<WeightEntry, 'date' | 'weightKg'>[], anyDateInWeek: ISODate): WeeklyAverage | null {
  const ws = weekStartMonday(anyDateInWeek);
  return weeklyAverages(entries).find((w) => w.weekStart === ws) ?? null;
}

export type WeeklyChange = { kind: 'ok'; deltaKg: number } | { kind: 'insufficient' };

export function weeklyChange(entries: Pick<WeightEntry, 'date' | 'weightKg'>[], anyDateInWeek: ISODate): WeeklyChange {
  const cur = averageForWeek(entries, anyDateInWeek);
  const prevWeek = fromDayNumber(toDayNumber(weekStartMonday(anyDateInWeek)) - 7);
  const prev = averageForWeek(entries, prevWeek);
  if (!cur || !prev) return { kind: 'insufficient' };
  return { kind: 'ok', deltaKg: cur.averageKg - prev.averageKg };
}

export function averageLabel(count: number): string {
  if (count <= 0) return 'sem registros';
  if (count === 1) return 'média de 1 registro (parcial)';
  if (count === 2) return 'média de 2 registros (parcial)';
  return `média de ${count} registros`;
}

/** Peso atual = registro mais recente (data + horário + criação). */
export function latestWeight<T extends Pick<WeightEntry, 'date' | 'measuredAt' | 'weightKg'>>(entries: T[]): T | null {
  if (entries.length === 0) return null;
  return [...entries].sort((a, b) => {
    const dd = toDayNumber(b.date) - toDayNumber(a.date);
    if (dd !== 0) return dd;
    return b.measuredAt.localeCompare(a.measuredAt);
  })[0];
}

// Alimentação -------------------------------------------------------------------
export interface Nutrients { kcal?: number; proteinG?: number; carbsG?: number; fatG?: number; nutritionIsEstimated: boolean }

/** Converte um alimento do catálogo para a quantidade consumida. Nunca inventa valores ausentes. */
export function nutrientsForAmount(food: Pick<FoodItem, 'referenceAmount' | 'referenceUnit' | 'kcalPerReference' | 'proteinGPerReference' | 'carbsGPerReference' | 'fatGPerReference'>, amount: number, unit: Unit): Nutrients | null {
  if (unit !== food.referenceUnit) return null; // unidades incompatíveis: não converter às cegas
  if (!isNum(amount) || amount <= 0 || !isNum(food.referenceAmount) || food.referenceAmount <= 0) return null;
  const f = amount / food.referenceAmount;
  const scale = (v?: number) => (isNum(v) ? v * f : undefined);
  return completeKcal({
    kcal: scale(food.kcalPerReference),
    proteinG: scale(food.proteinGPerReference),
    carbsG: scale(food.carbsGPerReference),
    fatG: scale(food.fatGPerReference),
    nutritionIsEstimated: false,
  });
}

/** Se kcal do rótulo existir, preserva. Se não, e se os três macros existirem, estima kcal. */
export function completeKcal(n: Nutrients): Nutrients {
  if (isNum(n.kcal)) return { ...n, nutritionIsEstimated: n.nutritionIsEstimated };
  if (isNum(n.proteinG) && isNum(n.carbsG) && isNum(n.fatG)) {
    return { ...n, kcal: kcalFromMacros(n.proteinG, n.carbsG, n.fatG), nutritionIsEstimated: true };
  }
  return { ...n, kcal: undefined };
}

export function hasAnyNutrition(f: Pick<FoodItem, 'kcalPerReference' | 'proteinGPerReference' | 'carbsGPerReference' | 'fatGPerReference'>): boolean {
  return [f.kcalPerReference, f.proteinGPerReference, f.carbsGPerReference, f.fatGPerReference].some(isNum);
}

export interface DayTotals {
  /** Quantidade de itens lançados no dia. */
  entries: number;
  kcal: number; proteinG: number; carbsG: number; fatG: number;
  /** Itens sem kcal conhecida (o total é um piso, não o consumo completo). */
  itemsMissingKcal: number;
  itemsMissingMacros: number;
  itemsEstimated: number;
  /** false quando não há nenhum lançamento — NÃO significa 0 kcal consumidas. */
  hasEntries: boolean;
}

export function dayTotals(logs: Pick<FoodLog, 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'nutritionIsEstimated'>[]): DayTotals {
  const t: DayTotals = { entries: logs.length, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, itemsMissingKcal: 0, itemsMissingMacros: 0, itemsEstimated: 0, hasEntries: logs.length > 0 };
  for (const l of logs) {
    if (isNum(l.kcal)) t.kcal += l.kcal; else t.itemsMissingKcal++;
    if (isNum(l.proteinG)) t.proteinG += l.proteinG;
    if (isNum(l.carbsG)) t.carbsG += l.carbsG;
    if (isNum(l.fatG)) t.fatG += l.fatG;
    if (!isNum(l.proteinG) || !isNum(l.carbsG) || !isNum(l.fatG)) t.itemsMissingMacros++;
    if (l.nutritionIsEstimated) t.itemsEstimated++;
  }
  return t;
}

/** Texto honesto do total calórico do dia. */
export function kcalSummaryText(t: DayTotals): string {
  if (!t.hasEntries) return 'Nenhum alimento registrado';
  const base = `${Math.round(t.kcal).toLocaleString('pt-BR')} kcal registradas`;
  if (t.itemsMissingKcal > 0) return `${base} (+${t.itemsMissingKcal} ${t.itemsMissingKcal === 1 ? 'item' : 'itens'} sem dados)`;
  return base;
}

// 9. Metas com data de vigência --------------------------------------------------
export function targetsForDate(all: NutritionTargets[], date: ISODate): NutritionTargets | null {
  const d = toDayNumber(date);
  const valid = all.filter((t) => toDayNumber(t.effectiveDate) <= d)
    .sort((a, b) => toDayNumber(b.effectiveDate) - toDayNumber(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt));
  if (valid.length) return valid[0];
  // Antes da primeira vigência: usar a mais antiga, sinalizada pela tela.
  const sorted = [...all].sort((a, b) => toDayNumber(a.effectiveDate) - toDayNumber(b.effectiveDate));
  return sorted[0] ?? null;
}

// 8. Adesão (denominadores = dias registrados) ------------------------------------
export interface Adherence { daysInPeriod: number; daysLogged: number; daysProteinHit: number; daysWithinKcal: number }

export function nutritionAdherence(
  days: ISODate[],
  logsByDay: Map<ISODate, Pick<FoodLog, 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'nutritionIsEstimated'>[]>,
  targets: NutritionTargets[],
  kcalTolerance = 0.1,
): Adherence {
  let daysLogged = 0, daysProteinHit = 0, daysWithinKcal = 0;
  for (const d of days) {
    const logs = logsByDay.get(d) ?? [];
    if (logs.length === 0) continue;
    daysLogged++;
    const t = dayTotals(logs);
    const tg = targetsForDate(targets, d);
    if (!tg) continue;
    if (t.proteinG >= tg.proteinG) daysProteinHit++;
    if (t.itemsMissingKcal === 0 && Math.abs(t.kcal - tg.caloriesKcal) <= tg.caloriesKcal * kcalTolerance) daysWithinKcal++;
  }
  return { daysInPeriod: days.length, daysLogged, daysProteinHit, daysWithinKcal };
}

// 10. Revisão de tendência (somente sugestão) ---------------------------------------
export type TrendReview =
  | { kind: 'insufficient'; reason: string }
  | { kind: 'stalled'; weeks: number }
  | { kind: 'fast'; avgLossPerWeek: number }
  | { kind: 'on_track'; avgLossPerWeek: number };

/**
 * Analisa as últimas 4 semanas com pelo menos 2 pesagens cada.
 * Nunca altera metas — apenas retorna uma sugestão para o usuário discutir.
 */
export function reviewTrend(entries: Pick<WeightEntry, 'date' | 'weightKg'>[], today: ISODate): TrendReview {
  const currentWs = weekStartMonday(today);
  const weeks = weeklyAverages(entries).filter((w) => diffDays(currentWs, w.weekStart) >= 0 && diffDays(currentWs, w.weekStart) <= 28);
  const solid = weeks.filter((w) => w.count >= 2);
  if (solid.length < 4) return { kind: 'insufficient', reason: 'São necessárias ~4 semanas seguidas com pelo menos 2 pesagens cada.' };
  const first = solid[0], last = solid[solid.length - 1];
  const spanWeeks = diffDays(last.weekStart, first.weekStart) / 7;
  if (spanWeeks < 3) return { kind: 'insufficient', reason: 'Período curto demais para avaliar tendência.' };
  const lossPerWeek = (first.averageKg - last.averageKg) / spanWeeks;
  if (first.averageKg - last.averageKg <= 0.1) return { kind: 'stalled', weeks: Math.round(spanWeeks) };
  if (lossPerWeek > 1.0) return { kind: 'fast', avgLossPerWeek: lossPerWeek };
  return { kind: 'on_track', avgLossPerWeek: lossPerWeek };
}

// Formatação ----------------------------------------------------------------------
export function fmt(n: number | null | undefined, decimals = 1): string {
  if (!isNum(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtInt(n: number | null | undefined): string {
  if (!isNum(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}

/** Aceita "112,6" ou "112.6". */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function weeksBetween(a: ISODate, b: ISODate): number {
  return diffDays(b, a) / 7;
}
