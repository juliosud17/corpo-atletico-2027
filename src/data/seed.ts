// Configuração padrão GENÉRICA (sem dados pessoais — o repositório é público).
// O plano pessoal do usuário é restaurado de um arquivo JSON privado (ver README).
// Não cria pesagens, refeições, treinos concluídos ou marcações de hábitos.
import type {
  ExercisePrescription, GoalMilestone, HabitDefinition, NutritionTargets, Settings, UserProfile, WorkoutPlan,
} from '../domain/types';
import { DEFAULT_TZ } from '../domain/dates';

/** Metas nutricionais padrão (genéricas e editáveis): 150×4 + 200×4 + 67×9 ≈ 2.000 kcal. */
export const INITIAL_TARGETS = {
  caloriesKcal: 2000, proteinG: 150, carbsG: 200, fatG: 67, waterMinMl: 2000, waterMaxMl: 3000,
};

export const INITIAL_MEALS = [
  { label: 'Café da manhã', time: '08:00' },
  { label: 'Almoço', time: '12:00' },
  { label: 'Lanche', time: '16:00' },
  { label: 'Jantar', time: '19:00' },
];

export const INITIAL_HABITS: Omit<HabitDefinition, 'id'>[] = [ // id = seed-habit-<order>
  { title: 'Registrar a alimentação de hoje', cadence: 'daily', targetCount: 1, active: true, order: 1 },
  { title: 'Beber água dentro da referência', cadence: 'daily', targetCount: 1, active: true, order: 2, hint: 'water_today' },
  { title: 'Priorizar 7 h de sono', cadence: 'daily', targetCount: 1, active: true, order: 3, hint: 'sleep' },
  { title: 'Registrar alimentação em pelo menos 6 de 7 dias', cadence: 'weekly', targetCount: 6, active: true, order: 10, hint: 'food_days_week' },
  { title: 'Atingir a meta de proteína em pelo menos 6 dias', cadence: 'weekly', targetCount: 6, active: true, order: 11, hint: 'protein_days_week' },
  { title: 'Registrar peso em 3 manhãs', cadence: 'weekly', targetCount: 3, active: true, order: 12, hint: 'weights_week' },
  { title: 'Realizar os treinos autorizados da semana', cadence: 'weekly', targetCount: 1, active: true, order: 13 },
  { title: 'Fazer o cardio liberado da semana', cadence: 'weekly', targetCount: 1, active: true, order: 14 },
  { title: 'Medir cintura (e fotos, se quiser) no dia 17', cadence: 'monthly', targetCount: 1, active: true, order: 20, hint: 'waist_month' },
];

const KNEE = 'Somente após avaliação profissional, se houver dor ou inchaço em joelhos/tornozelos.';
export const INITIAL_WORKOUT_PLANS: (Omit<WorkoutPlan, 'id'> & { exercises: { name: string; sets?: number; reps?: number; notes?: string }[] })[] = [
  { name: 'Musculação A — Peito, costas, braços e estabilidade', weekday: 1, type: 'strength', durationLabel: '45–60 min', requiresClearance: true, order: 1, safetyNote: 'Cargas leves; interromper se houver dor no ombro.',
    exercises: [ { name: 'Supino em máquina', sets: 3, reps: 10 }, { name: 'Puxada frontal', sets: 3, reps: 10 }, { name: 'Remada sentada', sets: 3, reps: 10 }, { name: 'Tríceps na polia', sets: 2, reps: 12 }, { name: 'Dead bug', sets: 2, reps: 10 } ] },
  { name: 'Cardio de baixo impacto', weekday: 2, type: 'cardio', durationLabel: '20–30 min', requiresClearance: true, order: 2, safetyNote: 'Sem corrida ou impacto enquanto joelhos/tornozelo não forem avaliados.', exercises: [] },
  { name: 'Musculação B — Pernas, glúteos e tronco', weekday: 3, type: 'strength', durationLabel: '45–60 min', requiresClearance: true, order: 3, safetyNote: KNEE,
    exercises: [ { name: 'Sentar e levantar do banco', sets: 2, reps: 10 }, { name: 'Mesa flexora', sets: 3, reps: 12 }, { name: 'Ponte de glúteos', sets: 3, reps: 12 }, { name: 'Fortalecimento de quadril', sets: 2, reps: 12 }, { name: 'Pallof press', sets: 2, reps: 12 } ] },
  { name: 'Cardio de baixo impacto', weekday: 4, type: 'cardio', durationLabel: '20–30 min', requiresClearance: true, order: 4, safetyNote: 'Sem corrida ou impacto enquanto joelhos/tornozelo não forem avaliados.', exercises: [] },
  { name: 'Musculação C — Costas, peito, ombros e braços', weekday: 5, type: 'strength', durationLabel: '45–60 min', requiresClearance: true, order: 5, safetyNote: 'Elevação lateral leve; interromper se houver dor no ombro.',
    exercises: [ { name: 'Remada apoiada', sets: 3, reps: 10 }, { name: 'Supino inclinado em máquina', sets: 3, reps: 10 }, { name: 'Puxada neutra', sets: 3, reps: 10 }, { name: 'Elevação lateral leve', sets: 2, reps: 12 }, { name: 'Rosca para bíceps', sets: 2, reps: 12 } ] },
  { name: 'Cardio leve ou mobilidade', weekday: 6, type: 'mobility', durationLabel: '20–30 min', requiresClearance: true, order: 6, exercises: [] },
  { name: 'Descanso', weekday: 0, type: 'rest', requiresClearance: false, order: 7, exercises: [] },
];

export function buildInitialProfile(now: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'me', displayName: 'Usuário', sexForBmr: 'unspecified', heightCm: 170, startWeightKg: 80, goalWeightKg: 75,
    startDate: now.slice(0, 10), targetDate: now.slice(0, 10), medicalClearanceConfirmed: false, planningOnly: false, createdAt: now, updatedAt: now, ...overrides,
  };
}

/** Marcos simples: início e objetivo (o usuário adiciona intermediários no Perfil). */
export function buildInitialMilestones(now: string, p: Pick<UserProfile, 'startDate' | 'startWeightKg' | 'targetDate' | 'goalWeightKg'>): GoalMilestone[] {
  return [
    { id: `seed-ms-${p.startDate}`, date: p.startDate, targetWeightKg: p.startWeightKg, status: 'pending', updatedAt: now },
    { id: `seed-ms-${p.targetDate}`, date: p.targetDate, targetWeightKg: p.goalWeightKg, status: 'pending', updatedAt: now },
  ];
}

export function buildInitialTargets(now: string, effectiveDate: string): NutritionTargets {
  return { id: 'seed-targets', effectiveDate, ...INITIAL_TARGETS, createdAt: now };
}

export function buildWorkoutPlans(): { plans: WorkoutPlan[]; exercises: ExercisePrescription[] } {
  const plans: WorkoutPlan[] = [];
  const exercises: ExercisePrescription[] = [];
  for (const p of INITIAL_WORKOUT_PLANS) {
    const { exercises: ex, ...plan } = p;
    const id = `seed-plan-${p.order}`;
    plans.push({ ...plan, id });
    ex.forEach((e, i) => exercises.push({ id: `${id}-ex-${i + 1}`, workoutPlanId: id, name: e.name, targetSets: e.sets, targetReps: e.reps, notes: e.notes, order: i }));
  }
  return { plans, exercises };
}

export function defaultSettings(now: string): Settings {
  return {
    id: 'app', onboardingDone: false, theme: 'dark', accent: 'orange', designVersion: 2, timeZone: DEFAULT_TZ,
    showWeight: true, showCalories: true, showWorkouts: true, showPhotos: false, trackingPaused: false,
    meals: INITIAL_MEALS, foodPreferences: '',
    updatedAt: now,
  };
}
