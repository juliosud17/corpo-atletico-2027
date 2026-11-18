// Operações de escrita/leitura agrupadas. Toda função que grava retorna Promise e
// lança erro em falha — as telas exibem feedback (toast) com opção de tentar novamente.
import { ALL_TABLES, db, nowISO, uid, type CorpoDB } from './db';
import {
  buildInitialMilestones, buildInitialProfile, buildInitialTargets, buildWorkoutPlans, defaultSettings,
  INITIAL_HABITS, seedFoodItems,
} from './seed';
import { monthKey, todayISO, weekStartMonday } from '../domain/dates';
import type {
  BackupFile, BodyMeasurement, Cadence, FoodItem, FoodLog, GoalMilestone, HabitDefinition, ISODate,
  NutritionTargets, RecoveryEntry, Settings, UserProfile, WaterEntry, WeightEntry, WorkoutSession,
} from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';

// Configuração inicial ------------------------------------------------------------
export interface OnboardingChoice {
  profile: Partial<UserProfile>;
  showWeight: boolean; showCalories: boolean; showWorkouts: boolean; showPhotos: boolean;
}

export async function completeOnboarding(choice: OnboardingChoice, database: CorpoDB = db): Promise<void> {
  const now = nowISO();
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    const settings = (await database.settings.get('app')) ?? defaultSettings(now);
    const profile = buildInitialProfile(now, choice.profile);
    await database.profile.put(profile);
    if ((await database.milestones.count()) === 0) await database.milestones.bulkPut(buildInitialMilestones(now, profile));
    if ((await database.targets.count()) === 0) await database.targets.put(buildInitialTargets(now, profile.startDate));
    if ((await database.foodItems.count()) === 0) await database.foodItems.bulkPut(seedFoodItems(now));
    if ((await database.habits.count()) === 0) await database.habits.bulkPut(INITIAL_HABITS.map((h) => ({ ...h, id: `seed-habit-${h.order}` })));
    if ((await database.workoutPlans.count()) === 0) {
      const { plans, exercises } = buildWorkoutPlans();
      await database.workoutPlans.bulkPut(plans);
      await database.exercises.bulkPut(exercises);
    }
    await database.settings.put({
      ...settings, onboardingDone: true, showWeight: choice.showWeight, showCalories: choice.showCalories,
      showWorkouts: choice.showWorkouts, showPhotos: choice.showPhotos, safetyAcknowledgedAt: now, updatedAt: now,
    });
  });
}

export async function getSettings(database: CorpoDB = db): Promise<Settings> {
  return (await database.settings.get('app')) ?? defaultSettings(nowISO());
}

export async function updateSettings(patch: Partial<Settings>, database: CorpoDB = db): Promise<void> {
  const cur = await getSettings(database);
  await database.settings.put({ ...cur, ...patch, id: 'app', updatedAt: nowISO() });
}

export async function updateProfile(patch: Partial<UserProfile>, database: CorpoDB = db): Promise<void> {
  const cur = await database.profile.get('me');
  if (!cur) throw new Error('Perfil não encontrado');
  await database.profile.put({ ...cur, ...patch, id: 'me', updatedAt: nowISO() });
}

// Peso --------------------------------------------------------------------------------
export async function saveWeight(input: { id?: string; date: ISODate; time?: string; weightKg: number; note?: string; measuredAt: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = input.id ? await database.weights.get(input.id) : undefined;
  const entry: WeightEntry = {
    id: existing?.id ?? uid(), date: input.date, time: input.time, measuredAt: input.measuredAt, weightKg: input.weightKg,
    note: input.note?.trim() || undefined, createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await database.weights.put(entry);
  return entry.id;
}

export const deleteWeight = (id: string, database: CorpoDB = db) => database.weights.delete(id);

// Medidas ------------------------------------------------------------------------------
export async function saveMeasurement(m: Omit<BodyMeasurement, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = m.id ? await database.measurements.get(m.id) : undefined;
  const entry: BodyMeasurement = { ...m, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.measurements.put(entry);
  return entry.id;
}
export const deleteMeasurement = (id: string, database: CorpoDB = db) => database.measurements.delete(id);

// Metas --------------------------------------------------------------------------------
export async function saveMilestone(m: Omit<GoalMilestone, 'id' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<void> {
  await database.milestones.put({ ...m, id: m.id ?? uid(), updatedAt: nowISO() });
}
export const deleteMilestone = (id: string, database: CorpoDB = db) => database.milestones.delete(id);

/** Nova versão das metas nutricionais com data de vigência — o histórico é preservado. */
export async function saveTargets(t: Omit<NutritionTargets, 'id' | 'createdAt'>, database: CorpoDB = db): Promise<void> {
  const same = await database.targets.where('effectiveDate').equals(t.effectiveDate).toArray();
  const now = nowISO();
  await database.transaction('rw', database.targets, async () => {
    if (same.length) await database.targets.bulkDelete(same.map((s) => s.id));
    await database.targets.put({ ...t, id: uid(), createdAt: now });
  });
}

// Alimentação ---------------------------------------------------------------------------
export async function saveFoodLog(l: Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = l.id ? await database.foodLogs.get(l.id) : undefined;
  const entry: FoodLog = { ...l, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.foodLogs.put(entry);
  return entry.id;
}
export const deleteFoodLog = (id: string, database: CorpoDB = db) => database.foodLogs.delete(id);

export async function saveFoodItem(f: Omit<FoodItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = f.id ? await database.foodItems.get(f.id) : undefined;
  const entry: FoodItem = { ...f, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.foodItems.put(entry);
  return entry.id;
}
export const deleteFoodItem = (id: string, database: CorpoDB = db) => database.foodItems.delete(id);

/** Copia os itens de uma refeição de um dia para outro (novos IDs, mesmo conteúdo). */
export async function copyMeal(fromDate: ISODate, toDate: ISODate, mealLabel: string, consumedAt: string, database: CorpoDB = db): Promise<number> {
  const src = (await database.foodLogs.where('date').equals(fromDate).toArray()).filter((l) => l.mealLabel === mealLabel);
  const now = nowISO();
  await database.foodLogs.bulkPut(src.map((l) => ({ ...l, id: uid(), date: toDate, consumedAt, createdAt: now, updatedAt: now })));
  return src.length;
}

export async function saveFavoriteMeal(name: string, date: ISODate, mealLabel: string, database: CorpoDB = db): Promise<number> {
  const src = (await database.foodLogs.where('date').equals(date).toArray()).filter((l) => l.mealLabel === mealLabel);
  if (!src.length) return 0;
  await database.favoriteMeals.put({
    id: uid(), name, createdAt: nowISO(),
    items: src.map(({ foodId, description, amount, unit, preparation, kcal, proteinG, carbsG, fatG, nutritionIsEstimated }) => ({ foodId, description, amount, unit, preparation, kcal, proteinG, carbsG, fatG, nutritionIsEstimated })),
  });
  return src.length;
}

export async function applyFavoriteMeal(favId: string, date: ISODate, mealLabel: string, consumedAt: string, database: CorpoDB = db): Promise<number> {
  const fav = await database.favoriteMeals.get(favId);
  if (!fav) return 0;
  const now = nowISO();
  await database.foodLogs.bulkPut(fav.items.map((i) => ({ ...i, id: uid(), date, mealLabel, consumedAt, createdAt: now, updatedAt: now })));
  return fav.items.length;
}

// Água --------------------------------------------------------------------------------
export async function addWater(date: ISODate, amountMl: number, consumedAt: string, database: CorpoDB = db): Promise<string> {
  const e: WaterEntry = { id: uid(), date, amountMl, consumedAt };
  await database.waterEntries.put(e);
  return e.id;
}
export const deleteWater = (id: string, database: CorpoDB = db) => database.waterEntries.delete(id);

// Hábitos ------------------------------------------------------------------------------
export function periodKeyFor(cadence: Cadence, date: ISODate): string {
  if (cadence === 'daily') return date;
  if (cadence === 'weekly') return weekStartMonday(date);
  return monthKey(date);
}

export async function setHabitCompletion(habit: HabitDefinition, date: ISODate, completed: boolean, database: CorpoDB = db): Promise<void> {
  const periodKey = periodKeyFor(habit.cadence, date);
  const id = `${habit.id}:${periodKey}`;
  if (!completed) { await database.completions.delete(id); return; }
  await database.completions.put({ id, habitId: habit.id, periodKey, date, completed: true, updatedAt: nowISO() });
}

export async function saveHabit(h: Omit<HabitDefinition, 'id'> & { id?: string }, database: CorpoDB = db): Promise<void> {
  await database.habits.put({ ...h, id: h.id ?? uid() });
}

export async function deleteHabit(id: string, database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', database.habits, database.completions, async () => {
    await database.completions.where('habitId').equals(id).delete();
    await database.habits.delete(id);
  });
}

// Treinos / recuperação ------------------------------------------------------------------
export async function saveWorkoutSession(s: Omit<WorkoutSession, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = s.id ? await database.workouts.get(s.id) : undefined;
  const entry: WorkoutSession = { ...s, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.workouts.put(entry);
  return entry.id;
}
export const deleteWorkoutSession = (id: string, database: CorpoDB = db) => database.workouts.delete(id);

export async function saveRecovery(r: Omit<RecoveryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = r.id ? await database.recovery.get(r.id) : undefined;
  const entry: RecoveryEntry = { ...r, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.recovery.put(entry);
  return entry.id;
}

// Backup -------------------------------------------------------------------------------
export async function exportBackup(database: CorpoDB = db): Promise<BackupFile> {
  return database.transaction('r', ALL_TABLES.map((t) => database.table(t)), async () => ({
    app: 'corpo-atletico-2027' as const,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    profile: (await database.profile.get('me')) ?? null,
    milestones: await database.milestones.toArray(),
    targets: await database.targets.toArray(),
    weights: await database.weights.toArray(),
    measurements: await database.measurements.toArray(),
    foodItems: await database.foodItems.toArray(),
    foodLogs: await database.foodLogs.toArray(),
    favoriteMeals: await database.favoriteMeals.toArray(),
    waterEntries: await database.waterEntries.toArray(),
    workoutPlans: await database.workoutPlans.toArray(),
    exercises: await database.exercises.toArray(),
    workouts: await database.workouts.toArray(),
    exerciseSets: await database.exerciseSets.toArray(),
    recovery: await database.recovery.toArray(),
    habits: await database.habits.toArray(),
    completions: await database.completions.toArray(),
    settings: (await database.settings.get('app')) ?? null,
  }));
}

export type ImportMode = 'merge' | 'replace';

/**
 * merge: grava por ID (bulkPut) — importar o mesmo arquivo duas vezes NÃO duplica.
 * replace: apaga tudo e restaura exatamente o arquivo.
 */
export async function importBackup(data: BackupFile, mode: ImportMode, database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    if (mode === 'replace') for (const t of ALL_TABLES) await database.table(t).clear();
    if (data.profile) await database.profile.put(data.profile);
    if (data.settings) await database.settings.put({ ...data.settings, onboardingDone: true });
    await database.milestones.bulkPut(data.milestones);
    await database.targets.bulkPut(data.targets);
    await database.weights.bulkPut(data.weights);
    await database.measurements.bulkPut(data.measurements);
    await database.foodItems.bulkPut(data.foodItems);
    await database.foodLogs.bulkPut(data.foodLogs);
    await database.favoriteMeals.bulkPut(data.favoriteMeals);
    await database.waterEntries.bulkPut(data.waterEntries);
    await database.workoutPlans.bulkPut(data.workoutPlans);
    await database.exercises.bulkPut(data.exercises);
    await database.workouts.bulkPut(data.workouts);
    await database.exerciseSets.bulkPut(data.exerciseSets);
    await database.recovery.bulkPut(data.recovery);
    await database.habits.bulkPut(data.habits);
    await database.completions.bulkPut(data.completions);
  });
}

export async function clearAllData(database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    for (const t of ALL_TABLES) await database.table(t).clear();
  });
}

export function backupFileName(tz?: string): string {
  return `corpo-atletico-2027-backup-${todayISO(tz)}.json`;
}

