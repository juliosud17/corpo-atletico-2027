import { z } from 'zod';
import { isISODate } from './dates';
import { SCHEMA_VERSION } from './types';
import type { BackupFile } from './types';

const isoDate = z.string().refine(isISODate, 'Data inválida (esperado AAAA-MM-DD)');
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Data/hora inválida');
const id = z.string().min(1).max(120);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const optNum = (min: number, max: number) => num(min, max).optional();
const unit = z.enum(['g', 'ml', 'unit']);
const prep = z.enum(['raw', 'cooked', 'other']).optional();
const text = (max = 500) => z.string().max(max);

// Formulários ---------------------------------------------------------------
export const weightFormSchema = z.object({
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido').optional(),
  weightKg: num(30, 350),
  note: text(300).optional(),
});

export const profileFormSchema = z.object({
  displayName: z.string().trim().min(1, 'Informe um nome').max(60),
  ageAtStart: num(12, 110).optional(),
  heightCm: num(100, 250),
  startDate: isoDate,
  startWeightKg: num(30, 350),
  goalWeightKg: num(30, 350),
  targetDate: isoDate,
});

export const targetsFormSchema = z.object({
  caloriesKcal: num(800, 8000),
  proteinG: num(0, 600),
  carbsG: num(0, 1200),
  fatG: num(0, 400),
  waterMinMl: num(0, 10000),
  waterMaxMl: num(0, 10000),
}).refine((v) => v.waterMaxMl >= v.waterMinMl, { message: 'Água: máximo deve ser ≥ mínimo', path: ['waterMaxMl'] });

// Backup --------------------------------------------------------------------
const base = { id };

const profile = z.object({
  ...base, displayName: text(80), birthDate: isoDate.optional(), ageAtStart: optNum(0, 130),
  sexForBmr: z.enum(['male', 'female', 'unspecified']), heightCm: num(50, 260), startDate: isoDate,
  startWeightKg: num(20, 400), goalWeightKg: num(20, 400), targetDate: isoDate,
  plannedRateKgPerWeek: optNum(0, 5), healthNotes: text(1000).optional(), medicalClearanceConfirmed: z.boolean(),
  medicalClearanceDate: isoDate.optional(), planningOnly: z.boolean().optional(),
  createdAt: isoDateTime, updatedAt: isoDateTime,
});

const milestone = z.object({
  ...base, date: isoDate, targetWeightKg: num(20, 400), note: text(300).optional(),
  status: z.enum(['pending', 'reached', 'not_reached', 'rescheduled']).optional(), updatedAt: isoDateTime,
});

const targets = z.object({
  ...base, effectiveDate: isoDate, caloriesKcal: num(0, 20000), proteinG: num(0, 2000), carbsG: num(0, 3000),
  fatG: num(0, 1000), waterMinMl: num(0, 20000), waterMaxMl: num(0, 20000), createdAt: isoDateTime,
});

const weight = z.object({
  ...base, date: isoDate, time: z.string().max(5).optional(), measuredAt: isoDateTime, weightKg: num(20, 400),
  note: text(500).optional(), createdAt: isoDateTime, updatedAt: isoDateTime,
});

const measurement = z.object({
  ...base, measuredOn: isoDate, waistCm: optNum(20, 300), hipCm: optNum(20, 300), chestCm: optNum(20, 300),
  armCm: optNum(5, 150), thighCm: optNum(10, 200), bodyFatPercent: optNum(1, 80), bodyFatMethod: text(120).optional(),
  note: text(500).optional(), createdAt: isoDateTime, updatedAt: isoDateTime,
});

const foodItem = z.object({
  ...base, name: text(160).min(1), brand: text(120).optional(), preparation: prep, referenceAmount: num(0.0001, 100000),
  referenceUnit: unit, kcalPerReference: optNum(0, 100000), proteinGPerReference: optNum(0, 10000),
  carbsGPerReference: optNum(0, 10000), fatGPerReference: optNum(0, 10000), source: text(300).optional(),
  favorite: z.boolean().optional(), builtin: z.boolean().optional(),
  group: z.enum(['protein', 'carb', 'dairy', 'fruit', 'vegetable', 'fat', 'other']).optional(), note: text(300).optional(),
  portions: z.array(z.object({ label: text(60).min(1), amount: num(0.0001, 100000) })).max(20).optional(),
  createdAt: isoDateTime, updatedAt: isoDateTime,
});

const nutrientFields = {
  kcal: optNum(0, 100000), proteinG: optNum(0, 10000), carbsG: optNum(0, 10000), fatG: optNum(0, 10000),
  nutritionIsEstimated: z.boolean(),
};

const foodLog = z.object({
  ...base, date: isoDate, consumedAt: isoDateTime, mealLabel: text(80), foodId: id.optional(), description: text(200),
  amount: num(0, 100000), unit, preparation: prep, ...nutrientFields, recipeId: id.optional(), note: text(500).optional(),
  createdAt: isoDateTime, updatedAt: isoDateTime,
});

const favoriteMeal = z.object({
  ...base, name: text(120), createdAt: isoDateTime,
  items: z.array(z.object({ foodId: id.optional(), description: text(200), amount: num(0, 100000), unit, preparation: prep, ...nutrientFields })).max(100),
});

const water = z.object({ ...base, date: isoDate, consumedAt: isoDateTime, amountMl: num(1, 10000) });

const workoutPlan = z.object({
  ...base, name: text(120), weekday: z.number().int().min(0).max(6), type: z.enum(['strength', 'cardio', 'mobility', 'rest']),
  durationLabel: text(40).optional(), requiresClearance: z.boolean(), safetyNote: text(400).optional(), order: z.number(),
});

const exercise = z.object({
  ...base, workoutPlanId: id, name: text(120), targetSets: optNum(0, 50), targetReps: optNum(0, 500), notes: text(400).optional(), order: z.number(),
});

const session = z.object({
  ...base, date: isoDate, planId: id.optional(), startedAt: isoDateTime.optional(), completedAt: isoDateTime.optional(),
  status: z.enum(['planned', 'completed', 'partial', 'postponed', 'cancelled', 'not_cleared']),
  inProgress: z.boolean().optional(), timerAccumulatedMs: optNum(0, 864e5), timerRunningSince: isoDateTime.optional(),
  cardioModality: text(80).optional(), cardioIntensity: optNum(0, 10),
  durationMin: optNum(0, 1440), cardioMinutes: optNum(0, 1440), rpe: optNum(0, 10), discomfort: text(500).optional(),
  notes: text(1000).optional(), confirmedWithoutClearance: z.boolean().optional(), createdAt: isoDateTime, updatedAt: isoDateTime,
});

const exerciseSet = z.object({
  ...base, sessionId: id, exerciseName: text(120), order: z.number(), reps: optNum(0, 1000), loadKg: optNum(0, 1000), rpe: optNum(0, 10),
  pain: z.boolean().optional(), note: text(300).optional(), createdAt: isoDateTime.optional(),
});

const scale = (a: number, b: number) => z.number().int().min(a).max(b).optional();
const recovery = z.object({
  ...base, date: isoDate, sleepHours: optNum(0, 24), sleepQuality1to5: scale(1, 5), energy1to5: scale(1, 5),
  hunger1to5: scale(1, 5), stress1to5: scale(1, 5), painRightKnee0to10: scale(0, 10), painLeftKnee0to10: scale(0, 10),
  painShoulder0to10: scale(0, 10), shoulderSide: z.enum(['left', 'right', 'both']).optional(), painLeftAnkle0to10: scale(0, 10),
  leftAnkleSwollen: z.boolean().optional(), ankleSwellingIntensity1to5: scale(1, 5), urgentSymptoms: z.boolean().optional(),
  soughtProfessional: z.boolean().optional(), professionalDate: isoDate.optional(), professionalNotes: text(1000).optional(),
  note: text(2000).optional(), createdAt: isoDateTime, updatedAt: isoDateTime,
});

const habit = z.object({
  ...base, title: text(160).min(1), cadence: z.enum(['daily', 'weekly', 'monthly']), targetCount: z.number().int().min(1).max(100),
  active: z.boolean(), order: z.number(),
  hint: z.enum(['weights_week', 'food_days_week', 'protein_days_week', 'waist_month', 'water_today', 'sleep']).optional(),
});

const completion = z.object({
  ...base, habitId: id, periodKey: z.string().max(10), date: isoDate, completed: z.boolean(), updatedAt: isoDateTime,
});

const settings = z.object({
  id: z.literal('app'), onboardingDone: z.boolean(), theme: z.enum(['dark', 'light', 'system']), accent: z.enum(['orange', 'green', 'blue']), designVersion: z.number().int().min(0).max(100).optional(),
  mealSplits: z.record(z.string().max(80), z.number().min(0).max(100)).optional(),
  timeZone: z.string().max(60), showWeight: z.boolean(), showCalories: z.boolean(), showWorkouts: z.boolean(), showPhotos: z.boolean(),
  trackingPaused: z.boolean(), safetyAcknowledgedAt: isoDateTime.optional(),
  meals: z.array(z.object({ label: text(80), time: z.string().max(5), reference: text(300).optional() })).max(20),
  foodPreferences: text(1000), lastBackupAt: isoDateTime.optional(),
  reviewLog: z.array(z.object({ date: isoDate, note: text(1000).optional() })).max(500).optional(),
  reminders: z.object({ weighIn: z.boolean(), meals: z.boolean(), workouts: z.boolean(), monthly: z.boolean(), review: z.boolean() }).optional(),
  updatedAt: isoDateTime,
});

const photo = z.object({
  ...base, capturedOn: isoDate, angle: z.enum(['front', 'side', 'back', 'other']), photoKind: z.enum(['real', 'simulation']),
  blobKey: id, width: optNum(1, 20000), height: optNum(1, 20000), note: text(300).optional(), createdAt: isoDateTime,
});
const b64 = z.string().max(30_000_000).regex(/^[A-Za-z0-9+/=]*$/, 'Imagem inválida');
const photoBlob = z.object({ ...base, type: z.string().regex(/^image\/(jpeg|png|webp)$/, 'Formato de imagem não suportado'), base64: b64, thumbBase64: b64.optional() });

const MAX = 50_000;
const arr = <T extends z.ZodTypeAny>(s: T) => z.array(s).max(MAX).default([]);

export const backupSchema = z.object({
  app: z.literal('corpo-atletico-2027'),
  schemaVersion: z.number().int().min(1).max(SCHEMA_VERSION),
  exportedAt: isoDateTime,
  profile: profile.nullable(),
  milestones: arr(milestone),
  targets: arr(targets),
  weights: arr(weight),
  measurements: arr(measurement),
  foodItems: arr(foodItem),
  foodLogs: arr(foodLog),
  favoriteMeals: arr(favoriteMeal),
  waterEntries: arr(water),
  workoutPlans: arr(workoutPlan),
  exercises: arr(exercise),
  workouts: arr(session),
  exerciseSets: arr(exerciseSet),
  recovery: arr(recovery),
  habits: arr(habit),
  completions: arr(completion),
  settings: settings.nullable(),
  recipes: z.array(z.object({
    ...base, name: text(160).min(1), servings: num(0.1, 1000), cookedWeightG: optNum(1, 100000), sourceUrl: text(1000).optional(),
    notes: text(4000).optional(), favorite: z.boolean().optional(), createdAt: isoDateTime, updatedAt: isoDateTime,
    ingredients: z.array(z.object({ ...base, text: text(300), foodId: id.optional(), amount: optNum(0, 100000), ignored: z.boolean().optional() })).max(200),
  })).max(5000).default([]),
  photos: z.array(photo).max(5000).default([]),
  photoBlobs: z.array(photoBlob).max(5000).default([]),
});

export type BackupValidation =
  | { ok: true; data: BackupFile; warnings: string[] }
  | { ok: false; errors: string[] };

const COLLECTIONS = ['milestones', 'targets', 'weights', 'measurements', 'foodItems', 'foodLogs', 'favoriteMeals', 'waterEntries', 'workoutPlans', 'exercises', 'workouts', 'exerciseSets', 'recovery', 'habits', 'completions'] as const;

export function validateBackup(input: unknown): BackupValidation {
  const r = backupSchema.safeParse(input);
  if (!r.success) {
    const errors = r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || 'arquivo'}: ${i.message}`);
    return { ok: false, errors };
  }
  const data = r.data as BackupFile;
  const warnings: string[] = [];
  // IDs duplicados dentro do próprio arquivo
  for (const key of COLLECTIONS) {
    const list = data[key] as { id: string }[];
    const seen = new Set<string>();
    let dup = 0;
    for (const item of list) { if (seen.has(item.id)) dup++; seen.add(item.id); }
    if (dup) warnings.push(`${dup} registro(s) com ID repetido em "${key}" — apenas o último será mantido.`);
  }
  // Consistência referencial
  const sessionIds = new Set(data.workouts.map((w) => w.id));
  const orphanSets = data.exerciseSets.filter((s) => !sessionIds.has(s.sessionId)).length;
  if (orphanSets) warnings.push(`${orphanSets} série(s) sem sessão correspondente.`);
  const blobIds = new Set((data.photoBlobs ?? []).map((b) => b.id));
  const photosWithoutImage = (data.photos ?? []).filter((p) => !blobIds.has(p.blobKey)).length;
  if (photosWithoutImage && blobIds.size) warnings.push(`${photosWithoutImage} foto(s) sem imagem no arquivo.`);
  const habitIds = new Set(data.habits.map((h) => h.id));
  const orphanComp = data.completions.filter((c) => !habitIds.has(c.habitId)).length;
  if (orphanComp) warnings.push(`${orphanComp} marcação(ões) de hábito sem hábito correspondente.`);
  return { ok: true, data, warnings };
}

export function backupCounts(b: BackupFile): { label: string; count: number }[] {
  return [
    { label: 'Pesagens', count: b.weights.length },
    { label: 'Medidas', count: b.measurements.length },
    { label: 'Alimentos no diário', count: b.foodLogs.length },
    { label: 'Alimentos no catálogo', count: b.foodItems.length },
    { label: 'Registros de água', count: b.waterEntries.length },
    { label: 'Sessões de treino', count: b.workouts.length },
    { label: 'Registros "Como estou"', count: b.recovery.length },
    { label: 'Hábitos', count: b.habits.length },
    { label: 'Marcações de hábitos', count: b.completions.length },
    { label: 'Marcos de meta', count: b.milestones.length },
    { label: 'Versões de metas nutricionais', count: b.targets.length },
    { label: 'Receitas', count: b.recipes?.length ?? 0 },
    { label: 'Fotos (dados)', count: b.photos?.length ?? 0 },
    { label: 'Fotos (imagens incluídas)', count: b.photoBlobs?.length ?? 0 },
  ];
}
