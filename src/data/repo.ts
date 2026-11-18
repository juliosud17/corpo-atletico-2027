// Operações de escrita/leitura agrupadas. Toda função que grava retorna Promise e
// lança erro em falha — as telas exibem feedback (toast) com opção de tentar novamente.
import { ALL_TABLES, db, nowISO, uid, type CorpoDB } from './db';
import {
  buildInitialMilestones, buildInitialProfile, buildInitialTargets, buildWorkoutPlans, defaultSettings,
  INITIAL_HABITS,
} from './seed';
import { REFERENCE_FOODS, referenceToFoodItem } from './foodDatabase';
import { hasAnyNutrition } from '../domain/calculations';
import { monthKey, todayISO, weekStartMonday } from '../domain/dates';
import type {
  BackupFile, BodyMeasurement, Cadence, ExercisePrescription, ExerciseSet, FoodItem, FoodLog, GoalMilestone, HabitDefinition, ISODate,
  NutritionTargets, PhotoBlob, ProgressPhoto, RecoveryEntry, Settings, UserProfile, WaterEntry, WeightEntry, WorkoutPlan, WorkoutSession,
} from '../domain/types';
import { elapsedMs } from '../domain/workouts';
import { base64ToBuffer, bufferToBase64 } from '../domain/binary';
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
  await syncReferenceFoods(database);
}

/**
 * Mantém a base de referência (TACO/IBGE) atualizada no catálogo local, preservando favoritos e porções
 * do usuário, e remove os itens-semente antigos que ficaram sem valores nutricionais.
 * Idempotente: só grava o que mudou.
 */
export async function syncReferenceFoods(database: CorpoDB = db): Promise<{ added: number; updated: number; removed: number }> {
  const now = nowISO();
  let added = 0, updated = 0, removed = 0;
  await database.transaction('rw', database.foodItems, async () => {
    for (const ref of REFERENCE_FOODS) {
      const existing = await database.foodItems.get(ref.id);
      const next = referenceToFoodItem(ref, now, existing);
      const same = existing && existing.name === next.name && existing.kcalPerReference === next.kcalPerReference && existing.proteinGPerReference === next.proteinGPerReference
        && existing.carbsGPerReference === next.carbsGPerReference && existing.fatGPerReference === next.fatGPerReference && existing.source === next.source
        && existing.referenceUnit === next.referenceUnit && existing.note === next.note && existing.group === next.group && existing.builtin;
      if (same) continue;
      await database.foodItems.put(next);
      if (existing) updated++; else added++;
    }
    const stale = (await database.foodItems.toArray()).filter((f) => f.id.startsWith('seed-food-') && !hasAnyNutrition(f) && !f.portions?.length);
    if (stale.length) { await database.foodItems.bulkDelete(stale.map((f) => f.id)); removed = stale.length; }
  });
  return { added, updated, removed };
}

export async function setFoodFavorite(id: string, favorite: boolean, database: CorpoDB = db): Promise<void> {
  await database.foodItems.update(id, { favorite, updatedAt: nowISO() });
}

export async function addFoodPortion(id: string, portion: { label: string; amount: number }, database: CorpoDB = db): Promise<void> {
  const f = await database.foodItems.get(id);
  if (!f) throw new Error('Alimento não encontrado');
  const portions = [...(f.portions ?? []).filter((p) => p.label.toLowerCase() !== portion.label.toLowerCase()), portion].slice(-20);
  await database.foodItems.update(id, { portions, updatedAt: nowISO() });
}

export async function removeFoodPortion(id: string, label: string, database: CorpoDB = db): Promise<void> {
  const f = await database.foodItems.get(id);
  if (!f) return;
  await database.foodItems.update(id, { portions: (f.portions ?? []).filter((p) => p.label !== label), updatedAt: nowISO() });
}

/** Cria uma cópia personalizada de um alimento da base (ex.: marca ou preparo diferente). */
export async function duplicateFood(id: string, patch: Partial<FoodItem>, database: CorpoDB = db): Promise<string> {
  const f = await database.foodItems.get(id);
  if (!f) throw new Error('Alimento não encontrado');
  const { id: _old, builtin: _b, createdAt: _c, updatedAt: _u, ...rest } = f;
  void _old; void _b; void _c; void _u;
  return saveFoodItem({ ...rest, favorite: true, ...patch, source: patch.source ?? `Ajustado por você a partir de: ${f.source ?? f.name}` }, database);
}

/** Registra vários itens de uma vez (prato rápido). */
export async function saveFoodLogs(items: Omit<FoodLog, 'id' | 'createdAt' | 'updatedAt'>[], database: CorpoDB = db): Promise<number> {
  const now = nowISO();
  await database.foodLogs.bulkPut(items.map((i) => ({ ...i, id: uid(), createdAt: now, updatedAt: now })));
  return items.length;
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
  // Mescla com o registro existente para não perder campos da sessão ao vivo (cronômetro, cardio).
  const entry: WorkoutSession = { ...(existing ?? {}), ...s, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now } as WorkoutSession;
  await database.workouts.put(entry);
  return entry.id;
}
export async function deleteWorkoutSession(id: string, database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', database.workouts, database.exerciseSets, async () => {
    await database.exerciseSets.where('sessionId').equals(id).delete();
    await database.workouts.delete(id);
  });
}

// Sessão ao vivo (Fase 2) ------------------------------------------------------------------
export async function getActiveSession(database: CorpoDB = db): Promise<WorkoutSession | undefined> {
  return database.workouts.filter((w) => !!w.inProgress).first();
}

export async function startLiveSession(input: { date: ISODate; planId?: string; confirmedWithoutClearance?: boolean }, database: CorpoDB = db): Promise<string> {
  const active = await getActiveSession(database);
  if (active) return active.id;
  const now = nowISO();
  const s: WorkoutSession = {
    id: uid(), date: input.date, planId: input.planId, status: 'planned', inProgress: true, startedAt: now,
    timerAccumulatedMs: 0, timerRunningSince: now, confirmedWithoutClearance: input.confirmedWithoutClearance || undefined,
    createdAt: now, updatedAt: now,
  };
  await database.workouts.put(s);
  return s.id;
}

export async function patchSession(id: string, patch: Partial<WorkoutSession>, database: CorpoDB = db): Promise<void> {
  await database.workouts.update(id, { ...patch, updatedAt: nowISO() });
}

export async function finishLiveSession(id: string, status: 'completed' | 'partial' | 'cancelled', database: CorpoDB = db, now: number = Date.now()): Promise<void> {
  const s = await database.workouts.get(id);
  if (!s) throw new Error('Sessão não encontrada');
  const ms = elapsedMs(s, now);
  await database.workouts.put({
    ...s, status, inProgress: false, timerAccumulatedMs: ms, timerRunningSince: undefined,
    durationMin: Math.max(s.durationMin ?? 0, Math.round(ms / 60000)) || undefined,
    completedAt: status === 'cancelled' ? undefined : new Date(now).toISOString(), updatedAt: nowISO(),
  });
}

export async function saveSet(set: Omit<ExerciseSet, 'id'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const id = set.id ?? uid();
  await database.exerciseSets.put({ ...set, id, createdAt: set.createdAt ?? nowISO() });
  return id;
}
export const deleteSet = (id: string, database: CorpoDB = db) => database.exerciseSets.delete(id);

// Plano de treino (Fase 2) -----------------------------------------------------------------
export async function savePlan(p: Omit<WorkoutPlan, 'id'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const id = p.id ?? uid();
  await database.workoutPlans.put({ ...p, id });
  return id;
}

export async function deletePlan(id: string, database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', database.workoutPlans, database.exercises, async () => {
    await database.exercises.where('workoutPlanId').equals(id).delete();
    await database.workoutPlans.delete(id);
  });
}

export async function saveExercise(e: Omit<ExercisePrescription, 'id'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const id = e.id ?? uid();
  await database.exercises.put({ ...e, id });
  return id;
}
export const deleteExercise = (id: string, database: CorpoDB = db) => database.exercises.delete(id);

/** Troca a ordem de um exercício com o vizinho (dir = -1 sobe, +1 desce). */
export async function moveExercise(id: string, dir: -1 | 1, database: CorpoDB = db): Promise<void> {
  const ex = await database.exercises.get(id);
  if (!ex) return;
  const list = (await database.exercises.where('workoutPlanId').equals(ex.workoutPlanId).toArray()).sort((a, b) => a.order - b.order);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await database.exercises.bulkPut(list.map((x, k) => ({ ...x, order: k })));
}

export async function saveRecovery(r: Omit<RecoveryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }, database: CorpoDB = db): Promise<string> {
  const now = nowISO();
  const existing = r.id ? await database.recovery.get(r.id) : undefined;
  const entry: RecoveryEntry = { ...r, id: existing?.id ?? uid(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await database.recovery.put(entry);
  return entry.id;
}

// Backup -------------------------------------------------------------------------------
export async function exportBackup(database: CorpoDB = db, opts: { includePhotos?: boolean } = {}): Promise<BackupFile> {
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
    photos: await database.photos.toArray(),
    photoBlobs: opts.includePhotos
      ? (await database.photoBlobs.toArray()).map((b) => ({ id: b.id, type: b.type, base64: bufferToBase64(b.data), thumbBase64: b.thumb ? bufferToBase64(b.thumb) : undefined }))
      : [],
  }));
}

export type ImportMode = 'merge' | 'replace';

/**
 * merge: grava por ID (bulkPut) — importar o mesmo arquivo duas vezes NÃO duplica.
 * replace: apaga tudo e restaura exatamente o arquivo.
 */
export async function importBackup(data: BackupFile, mode: ImportMode, database: CorpoDB = db): Promise<void> {
  const hasImages = (data.photoBlobs?.length ?? 0) > 0;
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    // Substituir: apaga tudo. Exceção: se o arquivo não traz imagens, as fotos deste aparelho são mantidas.
    if (mode === 'replace') for (const t of ALL_TABLES) if (hasImages || (t !== 'photos' && t !== 'photoBlobs')) await database.table(t).clear();
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
    if (data.photos?.length) {
      const known = new Set([...(await database.photoBlobs.toCollection().primaryKeys()), ...(data.photoBlobs ?? []).map((b) => b.id)]);
      await database.photos.bulkPut(data.photos.filter((p) => known.has(p.blobKey)));
    }
    if (hasImages) {
      await database.photoBlobs.bulkPut(data.photoBlobs!.map((b) => ({ id: b.id, type: b.type, data: base64ToBuffer(b.base64), thumb: b.thumbBase64 ? base64ToBuffer(b.thumbBase64) : undefined })));
    }
  });
  await syncReferenceFoods(database);
}

// Fotos (Fase 3) -----------------------------------------------------------------------------
export async function savePhoto(meta: Omit<ProgressPhoto, 'id' | 'blobKey' | 'createdAt'>, blob: Omit<PhotoBlob, 'id'>, database: CorpoDB = db): Promise<string> {
  const id = uid();
  await database.transaction('rw', database.photos, database.photoBlobs, async () => {
    await database.photoBlobs.put({ ...blob, id });
    await database.photos.put({ ...meta, id, blobKey: id, createdAt: nowISO() });
  });
  return id;
}

export async function updatePhoto(id: string, patch: Partial<Pick<ProgressPhoto, 'capturedOn' | 'angle' | 'photoKind' | 'note'>>, database: CorpoDB = db): Promise<void> {
  await database.photos.update(id, patch);
}

export async function deletePhoto(id: string, database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', database.photos, database.photoBlobs, async () => {
    const p = await database.photos.get(id);
    if (p) await database.photoBlobs.delete(p.blobKey);
    await database.photos.delete(id);
  });
}

// Revisões e lembretes (Fase 3) ------------------------------------------------------------------
export async function logReview(date: ISODate, note: string | undefined, database: CorpoDB = db): Promise<void> {
  const s = await getSettings(database);
  const log = [...(s.reviewLog ?? []).filter((r) => r.date !== date), { date, note: note?.trim() || undefined }].sort((a, b) => a.date.localeCompare(b.date));
  await updateSettings({ reviewLog: log.slice(-200) }, database);
}

export async function clearAllData(database: CorpoDB = db): Promise<void> {
  await database.transaction('rw', ALL_TABLES.map((t) => database.table(t)), async () => {
    for (const t of ALL_TABLES) await database.table(t).clear();
  });
}

export function backupFileName(tz?: string): string {
  return `corpo-atletico-2027-backup-${todayISO(tz)}.json`;
}

