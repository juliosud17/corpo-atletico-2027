import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMeasurement, ExercisePrescription, PhotoBlob, ProgressPhoto, Recipe, ExerciseSet, FavoriteMeal, FoodItem, FoodLog, GoalMilestone,
  HabitCompletion, HabitDefinition, NutritionTargets, RecoveryEntry, Settings, UserProfile, WaterEntry,
  WeightEntry, WorkoutPlan, WorkoutSession,
} from '../domain/types';

/** Esquema da versão 1 (Fase 1) — mantido para a migração. */
export const SCHEMA_V1 = {
  profile: 'id',
  milestones: 'id, date',
  targets: 'id, effectiveDate',
  weights: 'id, date, measuredAt',
  measurements: 'id, measuredOn',
  foodItems: 'id, name, favorite',
  foodLogs: 'id, date, mealLabel, foodId',
  favoriteMeals: 'id, name',
  waterEntries: 'id, date',
  workoutPlans: 'id, weekday, order',
  exercises: 'id, workoutPlanId, order',
  workouts: 'id, date, planId, status',
  exerciseSets: 'id, sessionId',
  recovery: 'id, date',
  habits: 'id, cadence, order',
  completions: 'id, habitId, periodKey, date',
  settings: 'id',
};

export class CorpoDB extends Dexie {
  profile!: EntityTable<UserProfile, 'id'>;
  milestones!: EntityTable<GoalMilestone, 'id'>;
  targets!: EntityTable<NutritionTargets, 'id'>;
  weights!: EntityTable<WeightEntry, 'id'>;
  measurements!: EntityTable<BodyMeasurement, 'id'>;
  foodItems!: EntityTable<FoodItem, 'id'>;
  foodLogs!: EntityTable<FoodLog, 'id'>;
  favoriteMeals!: EntityTable<FavoriteMeal, 'id'>;
  waterEntries!: EntityTable<WaterEntry, 'id'>;
  workoutPlans!: EntityTable<WorkoutPlan, 'id'>;
  exercises!: EntityTable<ExercisePrescription, 'id'>;
  workouts!: EntityTable<WorkoutSession, 'id'>;
  exerciseSets!: EntityTable<ExerciseSet, 'id'>;
  recovery!: EntityTable<RecoveryEntry, 'id'>;
  habits!: EntityTable<HabitDefinition, 'id'>;
  completions!: EntityTable<HabitCompletion, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  photos!: EntityTable<ProgressPhoto, 'id'>;
  photoBlobs!: EntityTable<PhotoBlob, 'id'>;
  recipes!: EntityTable<Recipe, 'id'>;

  constructor(name = 'corpo-atletico-2027') {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    // Fase 2: índice por exercício (histórico/evolução de carga). Dados existentes são preservados.
    this.version(2).stores({
      exerciseSets: 'id, sessionId, exerciseName',
    });
    // Fase 3: fotos privadas (metadados + binário separado, para listar sem carregar as imagens).
    this.version(3).stores({
      photos: 'id, capturedOn, angle, photoKind',
      photoBlobs: 'id',
    });
    // Receitas (importadas ou próprias), com ingredientes ligados à base de alimentos.
    this.version(4).stores({ recipes: 'id, name, updatedAt' });
  }
}

export const db = new CorpoDB();

export const ALL_TABLES = [
  'profile', 'milestones', 'targets', 'weights', 'measurements', 'foodItems', 'foodLogs', 'favoriteMeals',
  'waterEntries', 'workoutPlans', 'exercises', 'workouts', 'exerciseSets', 'recovery', 'habits', 'completions', 'settings',
  'photos', 'photoBlobs', 'recipes',
] as const;

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowISO = () => new Date().toISOString();

/** Mensagem legível para falhas de IndexedDB (quota, modo privado etc.). */
export function dbErrorMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(String(e))) return 'Sem espaço de armazenamento no navegador. Exporte um backup e libere espaço.';
  if (name === 'InvalidStateError' || name === 'MissingAPIError') return 'O armazenamento local não está disponível (modo privado?). Abra o app em uma aba normal.';
  return `Não foi possível salvar: ${(e as Error)?.message ?? String(e)}`;
}
