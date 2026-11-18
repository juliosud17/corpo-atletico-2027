// Divisão das metas diárias entre as refeições (puro).
import type { MealSlot, NutritionTargets } from './types';

export interface MealTarget { label: string; pct: number; kcal: number; proteinG: number; carbsG: number; fatG: number }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

/** Pesos padrão por tipo de refeição, normalizados para somar 100%. */
export function defaultSplits(meals: Pick<MealSlot, 'label'>[]): Record<string, number> {
  const weight = (label: string) => {
    const n = norm(label);
    if (n.includes('almoco')) return 30;
    if (n.includes('jantar')) return 25;
    if (n.includes('cafe')) return 20;
    if (n.includes('lanche')) return 15;
    if (n.includes('ceia')) return 10;
    return 15;
  };
  const w = meals.map((m) => weight(m.label));
  const total = w.reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = {};
  let acc = 0;
  meals.forEach((m, i) => {
    const v = i === meals.length - 1 ? 100 - acc : Math.round((w[i] / total) * 100);
    out[m.label] = v; acc += v;
  });
  return out;
}

/** Percentuais efetivos: usa os salvos quando somam 100% e cobrem as refeições atuais; senão, o padrão. */
export function effectiveSplits(meals: Pick<MealSlot, 'label'>[], saved?: Record<string, number>): Record<string, number> {
  if (saved && meals.every((m) => typeof saved[m.label] === 'number')) {
    const sum = meals.reduce((a, m) => a + saved[m.label], 0);
    if (Math.abs(sum - 100) < 0.5) return Object.fromEntries(meals.map((m) => [m.label, saved[m.label]]));
  }
  return defaultSplits(meals);
}

export function mealTargets(meals: Pick<MealSlot, 'label'>[], targets: NutritionTargets, saved?: Record<string, number>): MealTarget[] {
  const splits = effectiveSplits(meals, saved);
  return meals.map((m) => {
    const f = (splits[m.label] ?? 0) / 100;
    return { label: m.label, pct: splits[m.label] ?? 0, kcal: targets.caloriesKcal * f, proteinG: targets.proteinG * f, carbsG: targets.carbsG * f, fatG: targets.fatG * f };
  });
}

export type MealStatus = 'empty' | 'below' | 'on_target' | 'above';

/** Faixa de ±10% da meta da refeição. */
export function mealStatus(consumedKcal: number, hasEntries: boolean, targetKcal: number): MealStatus {
  if (!hasEntries) return 'empty';
  if (targetKcal <= 0) return 'on_target';
  if (consumedKcal < targetKcal * 0.9) return 'below';
  if (consumedKcal > targetKcal * 1.1) return 'above';
  return 'on_target';
}
