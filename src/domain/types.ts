// Modelo de dados do Corpo Atlético 2027 (baseado na Parte E.2 do briefing).
// Datas de calendário: 'YYYY-MM-DD' (ISODate). Instantes: ISO 8601 com fuso (ISODateTime).

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Unit = 'g' | 'ml' | 'unit';
export type Sex = 'male' | 'female' | 'unspecified';

export const SCHEMA_VERSION = 1;

export interface UserProfile {
  id: ID; // sempre 'me'
  displayName: string;
  birthDate?: ISODate;
  ageAtStart?: number;
  sexForBmr: Sex;
  heightCm: number;
  startDate: ISODate;
  startWeightKg: number;
  goalWeightKg: number;
  targetDate: ISODate;
  /** Ritmo pretendido em kg/semana (referência, não limite). */
  plannedRateKgPerWeek?: number;
  medicalClearanceConfirmed: boolean;
  medicalClearanceDate?: ISODate;
  /** Condições de saúde informadas pelo usuário (dores, lesões) — exibidas nos alertas de segurança. */
  healthNotes?: string;
  /** Usuário optou por registrar só o planejamento até ter liberação. */
  planningOnly?: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface GoalMilestone {
  id: ID;
  date: ISODate;
  targetWeightKg: number;
  note?: string;
  /** Status manual do marco (calendário de marcos). */
  status?: 'pending' | 'reached' | 'not_reached' | 'rescheduled';
  updatedAt: ISODateTime;
}

export interface NutritionTargets {
  id: ID;
  effectiveDate: ISODate;
  caloriesKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMinMl: number;
  waterMaxMl: number;
  createdAt: ISODateTime;
}

export interface WeightEntry {
  id: ID;
  /** Dia de calendário local da pesagem — usado para agrupar/plotar. */
  date: ISODate;
  /** Horário local HH:mm (opcional). */
  time?: string;
  measuredAt: ISODateTime;
  weightKg: number;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BodyMeasurement {
  id: ID;
  measuredOn: ISODate;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  /** Somente valor medido externamente, informado pelo usuário. */
  bodyFatPercent?: number;
  bodyFatMethod?: string;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProgressPhoto {
  id: ID;
  capturedOn: ISODate;
  angle: 'front' | 'side' | 'back' | 'other';
  /** 'real' = foto do usuário; 'simulation' = imagem de objetivo/simulação (referência artística). */
  photoKind: 'real' | 'simulation';
  blobKey: ID;
  width?: number;
  height?: number;
  note?: string;
  createdAt: ISODateTime;
}

/** Conteúdo binário da foto (somente no aparelho). */
export interface PhotoBlob {
  id: ID;
  type: string;
  data: ArrayBuffer;
  thumb?: ArrayBuffer;
}

export interface ReviewLogEntry {
  date: ISODate;
  note?: string;
}

export interface ReminderSettings {
  weighIn: boolean;
  meals: boolean;
  workouts: boolean;
  monthly: boolean;
  review: boolean;
}

export interface FoodItem {
  id: ID;
  name: string;
  brand?: string;
  preparation?: 'raw' | 'cooked' | 'other';
  referenceAmount: number;
  referenceUnit: Unit;
  kcalPerReference?: number;
  proteinGPerReference?: number;
  carbsGPerReference?: number;
  fatGPerReference?: number;
  source?: string;
  favorite?: boolean;
  /** Item da base de referência (TACO/IBGE) — valores não são editados no lugar; duplique para personalizar. */
  builtin?: boolean;
  group?: 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'fat' | 'other';
  note?: string;
  /** Porções do próprio usuário, ex.: "1 filé" = 120 g. */
  portions?: FoodPortion[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FoodPortion { label: string; amount: number }

export interface FoodLog {
  id: ID;
  /** Dia do diário ao qual o item pertence (ex.: ceia 00h15 pode contar no dia anterior). */
  date: ISODate;
  consumedAt: ISODateTime;
  mealLabel: string;
  foodId?: ID;
  description: string;
  amount: number;
  unit: Unit;
  preparation?: 'raw' | 'cooked' | 'other';
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** true quando kcal foi estimada por P×4 + C×4 + G×9 (não veio do rótulo). */
  nutritionIsEstimated: boolean;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface FavoriteMealItem {
  foodId?: ID;
  description: string;
  amount: number;
  unit: Unit;
  preparation?: 'raw' | 'cooked' | 'other';
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  nutritionIsEstimated: boolean;
}

export interface FavoriteMeal {
  id: ID;
  name: string;
  items: FavoriteMealItem[];
  createdAt: ISODateTime;
}

export interface WaterEntry {
  id: ID;
  date: ISODate;
  consumedAt: ISODateTime;
  amountMl: number;
}

export interface WorkoutPlan {
  id: ID;
  name: string;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  type: 'strength' | 'cardio' | 'mobility' | 'rest';
  durationLabel?: string;
  requiresClearance: boolean;
  safetyNote?: string;
  order: number;
}

export interface ExercisePrescription {
  id: ID;
  workoutPlanId: ID;
  name: string;
  targetSets?: number;
  targetReps?: number;
  notes?: string;
  order: number;
}

export type WorkoutStatus = 'planned' | 'completed' | 'partial' | 'postponed' | 'cancelled' | 'not_cleared';

export interface WorkoutSession {
  id: ID;
  date: ISODate;
  planId?: ID;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  status: WorkoutStatus;
  /** Sessão aberta no modo "ao vivo" (cronômetro + séries). */
  inProgress?: boolean;
  /** Tempo acumulado do cronômetro (ms) até a última pausa. */
  timerAccumulatedMs?: number;
  /** Instante em que o cronômetro voltou a correr (ausente = pausado). */
  timerRunningSince?: ISODateTime;
  durationMin?: number;
  cardioMinutes?: number;
  cardioModality?: string;
  /** Intensidade percebida do cardio (0–10). */
  cardioIntensity?: number;
  rpe?: number;
  discomfort?: string;
  notes?: string;
  /** Registrado após confirmação explícita sem liberação profissional. */
  confirmedWithoutClearance?: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ExerciseSet {
  id: ID;
  sessionId: ID;
  exerciseName: string;
  order: number;
  reps?: number;
  loadKg?: number;
  rpe?: number;
  /** Série interrompida/feita com dor ou desconforto. */
  pain?: boolean;
  note?: string;
  createdAt?: ISODateTime;
}

export interface RecoveryEntry {
  id: ID;
  date: ISODate;
  sleepHours?: number;
  sleepQuality1to5?: number;
  energy1to5?: number;
  hunger1to5?: number;
  stress1to5?: number;
  painRightKnee0to10?: number;
  painLeftKnee0to10?: number;
  painShoulder0to10?: number;
  shoulderSide?: 'left' | 'right' | 'both';
  painLeftAnkle0to10?: number;
  leftAnkleSwollen?: boolean;
  ankleSwellingIntensity1to5?: number;
  urgentSymptoms?: boolean;
  soughtProfessional?: boolean;
  professionalDate?: ISODate;
  professionalNotes?: string;
  note?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface HabitDefinition {
  id: ID;
  title: string;
  cadence: Cadence;
  targetCount: number;
  active: boolean;
  order: number;
  /** Ajuda contextual opcional (ex.: "pesagens registradas nesta semana"). */
  hint?: 'weights_week' | 'food_days_week' | 'protein_days_week' | 'waist_month' | 'water_today' | 'sleep';
}

export interface HabitCompletion {
  id: ID; // `${habitId}:${periodKey}` — estável
  habitId: ID;
  /** daily: YYYY-MM-DD; weekly: segunda-feira YYYY-MM-DD; monthly: YYYY-MM */
  periodKey: string;
  date: ISODate;
  completed: boolean;
  updatedAt: ISODateTime;
}

export interface MealSlot {
  label: string;
  time: string;
  reference?: string;
}

export interface Settings {
  id: 'app';
  onboardingDone: boolean;
  theme: 'dark' | 'light' | 'system';
  accent: 'green' | 'blue';
  timeZone: string;
  showWeight: boolean;
  showCalories: boolean;
  showWorkouts: boolean;
  showPhotos: boolean;
  trackingPaused: boolean;
  safetyAcknowledgedAt?: ISODateTime;
  meals: MealSlot[];
  foodPreferences: string;
  lastBackupAt?: ISODateTime;
  /** Revisões de 14–21 dias registradas pelo usuário. */
  reviewLog?: ReviewLogEntry[];
  reminders?: ReminderSettings;
  updatedAt: ISODateTime;
}

export interface BackupFile {
  app: 'corpo-atletico-2027';
  schemaVersion: number;
  exportedAt: ISODateTime;
  profile: UserProfile | null;
  milestones: GoalMilestone[];
  targets: NutritionTargets[];
  weights: WeightEntry[];
  measurements: BodyMeasurement[];
  foodItems: FoodItem[];
  foodLogs: FoodLog[];
  favoriteMeals: FavoriteMeal[];
  waterEntries: WaterEntry[];
  workoutPlans: WorkoutPlan[];
  exercises: ExercisePrescription[];
  workouts: WorkoutSession[];
  exerciseSets: ExerciseSet[];
  recovery: RecoveryEntry[];
  habits: HabitDefinition[];
  completions: HabitCompletion[];
  settings: Settings | null;
  /** Opcional: metadados das fotos (sempre exportados) e conteúdo em base64 (só se o usuário pedir). */
  photos?: ProgressPhoto[];
  photoBlobs?: { id: ID; type: string; base64: string; thumbBase64?: string }[];
}
