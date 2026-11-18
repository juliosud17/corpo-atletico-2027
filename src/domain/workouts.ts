// Regras puras da Fase 2 (treinos). Sem efeitos colaterais.
import { addDays, weekStartMonday } from './dates';
import type { ExercisePrescription, ExerciseSet, ISODate, WorkoutSession } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Cronômetro ------------------------------------------------------------------------
export function elapsedMs(s: Pick<WorkoutSession, 'timerAccumulatedMs' | 'timerRunningSince'>, now: number = Date.now()): number {
  const acc = s.timerAccumulatedMs ?? 0;
  if (!s.timerRunningSince) return acc;
  const since = Date.parse(s.timerRunningSince);
  return Number.isNaN(since) ? acc : acc + Math.max(0, now - since);
}

export function pauseTimer<T extends Pick<WorkoutSession, 'timerAccumulatedMs' | 'timerRunningSince'>>(s: T, now: number = Date.now()): T {
  return { ...s, timerAccumulatedMs: elapsedMs(s, now), timerRunningSince: undefined };
}

export function resumeTimer<T extends Pick<WorkoutSession, 'timerAccumulatedMs' | 'timerRunningSince'>>(s: T, now: number = Date.now()): T {
  if (s.timerRunningSince) return s;
  return { ...s, timerRunningSince: new Date(now).toISOString() };
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Histórico por exercício --------------------------------------------------------------
export interface ExerciseSessionSummary {
  sessionId: string;
  date: ISODate;
  sets: number;
  totalReps: number;
  maxLoadKg: number | null;
  /** Soma de reps × carga (kg), só das séries com carga. */
  volumeKg: number;
  maxRpe: number | null;
  anyPain: boolean;
  repsPerSet: number[];
}

export const normalizeName = (n: string) => n.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function exerciseHistory(name: string, sets: ExerciseSet[], sessions: Pick<WorkoutSession, 'id' | 'date' | 'status'>[]): ExerciseSessionSummary[] {
  const key = normalizeName(name);
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const groups = new Map<string, ExerciseSet[]>();
  for (const st of sets) {
    if (normalizeName(st.exerciseName) !== key) continue;
    const ses = byId.get(st.sessionId);
    if (!ses || ses.status === 'cancelled') continue;
    groups.set(st.sessionId, [...(groups.get(st.sessionId) ?? []), st]);
  }
  return [...groups.entries()].map(([sessionId, list]) => {
    const loads = list.map((s) => s.loadKg).filter(isNum);
    const rpes = list.map((s) => s.rpe).filter(isNum);
    return {
      sessionId,
      date: byId.get(sessionId)!.date,
      sets: list.length,
      totalReps: list.reduce((a, s) => a + (s.reps ?? 0), 0),
      maxLoadKg: loads.length ? Math.max(...loads) : null,
      volumeKg: list.reduce((a, s) => a + (isNum(s.loadKg) && isNum(s.reps) ? s.loadKg * s.reps : 0), 0),
      maxRpe: rpes.length ? Math.max(...rpes) : null,
      anyPain: list.some((s) => s.pain),
      repsPerSet: [...list].sort((a, b) => a.order - b.order).map((s) => s.reps ?? 0),
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Progressão --------------------------------------------------------------------------
export type Progression =
  | { kind: 'insufficient'; reason: string }
  | { kind: 'increase'; reason: string }
  | { kind: 'hold'; reason: string }
  | { kind: 'pain'; reason: string };

/**
 * Regra do briefing: aumentar a carga só quando todas as séries foram feitas com técnica
 * confortável em DUAS sessões consecutivas. "Confortável" = séries e repetições-alvo
 * cumpridas, RPE ≤ 8 (2–3 repetições sobrando) e nenhuma série com dor.
 * Retorna apenas uma sugestão; nada é alterado automaticamente.
 */
export function progressionSuggestion(history: ExerciseSessionSummary[], target: Pick<ExercisePrescription, 'targetSets' | 'targetReps'>): Progression {
  if (history.length < 2) return { kind: 'insufficient', reason: 'Registre pelo menos duas sessões deste exercício.' };
  const last2 = history.slice(-2);
  if (last2.some((h) => h.anyPain)) return { kind: 'pain', reason: 'Houve dor ou desconforto recente: mantenha ou reduza a carga e procure orientação se persistir.' };
  const ok = last2.every((h) => {
    const setsOk = target.targetSets ? h.sets >= target.targetSets : true;
    const repsOk = target.targetReps ? h.repsPerSet.every((r) => r >= target.targetReps!) : true;
    const rpeOk = h.maxRpe === null || h.maxRpe <= 8;
    return setsOk && repsOk && rpeOk && h.sets > 0;
  });
  if (ok) return { kind: 'increase', reason: 'Duas sessões seguidas completas e confortáveis: você pode considerar um pequeno aumento de carga.' };
  return { kind: 'hold', reason: 'Mantenha a carga até completar todas as séries com conforto em duas sessões seguidas.' };
}

// Cardio semanal ------------------------------------------------------------------------
export function weeklyCardioMinutes(sessions: Pick<WorkoutSession, 'date' | 'status' | 'cardioMinutes'>[], anyDateInWeek: ISODate): number {
  const ws = weekStartMonday(anyDateInWeek);
  const we = addDays(ws, 6);
  return sessions
    .filter((s) => s.date >= ws && s.date <= we && (s.status === 'completed' || s.status === 'partial'))
    .reduce((a, s) => a + (s.cardioMinutes ?? 0), 0);
}

/** Grade do mês (semanas começando na segunda), com dias de fora do mês como null. */
export function monthGrid(year: number, month1to12: number): (ISODate | null)[][] {
  const first = `${year}-${String(month1to12).padStart(2, '0')}-01`;
  const dim = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  const start = weekStartMonday(first);
  const weeks: (ISODate | null)[][] = [];
  let d = start;
  while (true) {
    const week: (ISODate | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const inMonth = d.slice(0, 7) === first.slice(0, 7);
      week.push(inMonth ? d : null);
      d = addDays(d, 1);
    }
    weeks.push(week);
    if (d.slice(0, 7) !== first.slice(0, 7) && (d > `${first.slice(0, 7)}-${String(dim).padStart(2, '0')}`)) break;
  }
  return weeks;
}
