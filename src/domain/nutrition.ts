// Ajudas do diário alimentar (puras). Nada é registrado automaticamente.
import { nutrientsForAmount } from './calculations';
import type { FoodItem, FoodLog, NutritionTargets } from './types';

export interface Remaining { kcal: number; proteinG: number; carbsG: number; fatG: number }

export function remainingForDay(totals: { kcal: number; proteinG: number; carbsG: number; fatG: number }, t: NutritionTargets): Remaining {
  return { kcal: t.caloriesKcal - totals.kcal, proteinG: t.proteinG - totals.proteinG, carbsG: t.carbsG - totals.carbsG, fatG: t.fatG - totals.fatG };
}

export interface Filler { food: FoodItem; amount: number; unit: FoodItem['referenceUnit']; kcal: number; proteinG: number }

/**
 * Quanto de cada proteína do dia a dia cobriria a proteína que falta (arredondado a 10 g).
 * Só usa alimentos com proteína e kcal conhecidas; ignora quantidades acima de `maxAmount`.
 */
export function proteinFillers(missingProteinG: number, foods: FoodItem[], maxAmount = 400): Filler[] {
  if (!(missingProteinG > 3)) return [];
  const out: Filler[] = [];
  for (const f of foods) {
    const p = f.proteinGPerReference, k = f.kcalPerReference;
    if (p === undefined || k === undefined || p <= 0 || f.referenceAmount <= 0) continue;
    const raw = (missingProteinG / p) * f.referenceAmount;
    const amount = Math.max(10, Math.ceil(raw / 10) * 10);
    if (amount > maxAmount) continue;
    const n = nutrientsForAmount(f, amount, f.referenceUnit)!;
    out.push({ food: f, amount, unit: f.referenceUnit, kcal: n.kcal ?? 0, proteinG: n.proteinG ?? 0 });
  }
  // Menos calorias para a mesma proteína primeiro.
  return out.sort((a, b) => a.kcal - b.kcal);
}

/** Alimentos usados recentemente (mais recentes primeiro, sem repetir). */
export function recentFoodIds(logs: Pick<FoodLog, 'foodId' | 'createdAt'>[], limit = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!l.foodId || seen.has(l.foodId)) continue;
    seen.add(l.foodId); out.push(l.foodId);
    if (out.length >= limit) break;
  }
  return out;
}

/** Densidade proteica: g de proteína por 100 kcal (útil para comparar cortes). */
export function proteinPer100kcal(f: Pick<FoodItem, 'kcalPerReference' | 'proteinGPerReference'>): number | null {
  if (!f.kcalPerReference || f.proteinGPerReference === undefined) return null;
  return (f.proteinGPerReference / f.kcalPerReference) * 100;
}
