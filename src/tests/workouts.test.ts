import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { CorpoDB, SCHEMA_V1 } from '../data/db';
import {
  completeOnboarding, deleteExercise, deletePlan, deleteWorkoutSession, exportBackup, finishLiveSession, getActiveSession,
  moveExercise, patchSession, saveExercise, saveSet, startLiveSession,
} from '../data/repo';
import {
  elapsedMs, exerciseHistory, formatClock, monthGrid, pauseTimer, progressionSuggestion, resumeTimer, weeklyCardioMinutes,
} from '../domain/workouts';
import { validateBackup } from '../domain/validations';
import type { ExerciseSet, WorkoutSession } from '../domain/types';

describe('Cronômetro', () => {
  const t0 = Date.parse('2026-11-18T10:00:00Z');
  it('acumula, pausa e retoma sem perder tempo', () => {
    let s: Pick<WorkoutSession, 'timerAccumulatedMs' | 'timerRunningSince'> = { timerAccumulatedMs: 0, timerRunningSince: new Date(t0).toISOString() };
    expect(elapsedMs(s, t0 + 90_000)).toBe(90_000);
    s = pauseTimer(s, t0 + 90_000);
    expect(s.timerRunningSince).toBeUndefined();
    expect(elapsedMs(s, t0 + 999_000)).toBe(90_000); // pausado não conta
    s = resumeTimer(s, t0 + 200_000);
    expect(elapsedMs(s, t0 + 230_000)).toBe(120_000);
  });
  it('formata mm:ss e h:mm:ss', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });
});

describe('Histórico e progressão por exercício', () => {
  const sessions = [
    { id: 's1', date: '2026-11-23', status: 'completed' as const },
    { id: 's2', date: '2026-11-30', status: 'completed' as const },
    { id: 's3', date: '2026-12-07', status: 'cancelled' as const },
  ];
  const mk = (sessionId: string, order: number, reps: number, loadKg?: number, rpe?: number, pain?: boolean): ExerciseSet =>
    ({ id: `${sessionId}-${order}`, sessionId, exerciseName: 'Supino em máquina', order, reps, loadKg, rpe, pain });

  it('agrupa por sessão, calcula carga máxima e volume, ignora canceladas e acentos', () => {
    const sets = [mk('s1', 0, 10, 30, 7), mk('s1', 1, 10, 32.5, 8), mk('s2', 0, 10, 35, 7), mk('s3', 0, 10, 99)];
    sets.push({ ...mk('s2', 1, 8, 35, 9), exerciseName: 'supino em maquina ' });
    const h = exerciseHistory('Supino em Máquina', sets, sessions);
    expect(h.map((x) => x.date)).toEqual(['2026-11-23', '2026-11-30']);
    expect(h[0]).toMatchObject({ sets: 2, totalReps: 20, maxLoadKg: 32.5, volumeKg: 625 });
    expect(h[1].sets).toBe(2);
  });

  it('sugere aumento só com duas sessões seguidas completas e confortáveis', () => {
    const target = { targetSets: 2, targetReps: 10 };
    const good = exerciseHistory('Supino em máquina', [mk('s1', 0, 10, 30, 7), mk('s1', 1, 10, 30, 8), mk('s2', 0, 10, 30, 7), mk('s2', 1, 10, 30, 8)], sessions);
    expect(progressionSuggestion(good, target).kind).toBe('increase');
    const oneShort = exerciseHistory('Supino em máquina', [mk('s1', 0, 10, 30, 7), mk('s1', 1, 10, 30, 8), mk('s2', 0, 10, 30, 7), mk('s2', 1, 8, 30, 8)], sessions);
    expect(progressionSuggestion(oneShort, target).kind).toBe('hold');
    const hard = exerciseHistory('Supino em máquina', [mk('s1', 0, 10, 30, 9), mk('s1', 1, 10, 30, 9), mk('s2', 0, 10, 30, 9), mk('s2', 1, 10, 30, 9)], sessions);
    expect(progressionSuggestion(hard, target).kind).toBe('hold');
    const pain = exerciseHistory('Supino em máquina', [mk('s1', 0, 10, 30, 7), mk('s2', 0, 10, 30, 7, true)], sessions);
    expect(progressionSuggestion(pain, target).kind).toBe('pain');
    expect(progressionSuggestion(good.slice(0, 1), target).kind).toBe('insufficient');
  });
});

describe('Cardio e calendário', () => {
  it('soma cardio só de sessões concluídas/parciais da semana', () => {
    const s = [
      { date: '2026-11-17', status: 'completed' as const, cardioMinutes: 25 },
      { date: '2026-11-19', status: 'partial' as const, cardioMinutes: 15 },
      { date: '2026-11-20', status: 'not_cleared' as const, cardioMinutes: 30 },
      { date: '2026-11-24', status: 'completed' as const, cardioMinutes: 30 },
    ];
    expect(weeklyCardioMinutes(s, '2026-11-18')).toBe(40);
  });
  it('grade do mês começa na segunda e cobre todos os dias', () => {
    const g = monthGrid(2026, 11);
    expect(g[0][6]).toBe('2026-11-01'); // 01/11/2026 é domingo
    expect(g[0][0]).toBeNull();
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });
});

let n = 0;
let database: CorpoDB;
beforeEach(async () => { database = new CorpoDB(`w-${++n}`); await database.open(); });
const onboard = () => completeOnboarding({ profile: { displayName: 'T', heightCm: 180, startWeightKg: 100, goalWeightKg: 90, startDate: '2026-11-17', targetDate: '2027-09-17' }, showWeight: true, showCalories: true, showWorkouts: true, showPhotos: false }, database);

describe('Sessão ao vivo (persistência)', () => {
  it('inicia uma única sessão ativa, registra séries e finaliza com duração', async () => {
    await onboard();
    const t0 = Date.now();
    const id = await startLiveSession({ date: '2026-11-23', planId: 'seed-plan-1', confirmedWithoutClearance: true }, database);
    expect(await startLiveSession({ date: '2026-11-23' }, database)).toBe(id); // não cria outra
    expect((await getActiveSession(database))?.id).toBe(id);
    await saveSet({ sessionId: id, exerciseName: 'Supino em máquina', order: 0, reps: 10, loadKg: 30, rpe: 7 }, database);
    await saveSet({ sessionId: id, exerciseName: 'Supino em máquina', order: 1, reps: 10, loadKg: 30, rpe: 8 }, database);
    await patchSession(id, { cardioMinutes: 10, cardioModality: 'Bicicleta' }, database);
    await finishLiveSession(id, 'completed', database, t0 + 46 * 60_000);
    const s = await database.workouts.get(id);
    expect(s).toMatchObject({ status: 'completed', inProgress: false, cardioMinutes: 10, confirmedWithoutClearance: true });
    expect(s!.durationMin).toBeGreaterThanOrEqual(45);
    expect(await getActiveSession(database)).toBeUndefined();
    expect(await database.exerciseSets.where('exerciseName').equals('Supino em máquina').count()).toBe(2);
    // backup inclui os novos campos e continua válido
    const v = validateBackup(JSON.parse(JSON.stringify(await exportBackup(database))));
    expect(v.ok).toBe(true);
    // excluir a sessão remove as séries
    await deleteWorkoutSession(id, database);
    expect(await database.exerciseSets.count()).toBe(0);
  });

  it('editor de plano: adicionar, reordenar e excluir exercícios; excluir plano remove os exercícios', async () => {
    await onboard();
    const ex = (await database.exercises.where('workoutPlanId').equals('seed-plan-1').toArray()).sort((a, b) => a.order - b.order);
    await moveExercise(ex[1].id, -1, database);
    const after = (await database.exercises.where('workoutPlanId').equals('seed-plan-1').toArray()).sort((a, b) => a.order - b.order);
    expect(after[0].id).toBe(ex[1].id);
    const nid = await saveExercise({ workoutPlanId: 'seed-plan-1', name: 'Face pull', targetSets: 2, targetReps: 15, order: 99 }, database);
    expect(await database.exercises.where('workoutPlanId').equals('seed-plan-1').count()).toBe(ex.length + 1);
    await deleteExercise(nid, database);
    await deletePlan('seed-plan-1', database);
    expect(await database.exercises.where('workoutPlanId').equals('seed-plan-1').count()).toBe(0);
  });
});

describe('Migração v1 → v2', () => {
  it('preserva os dados da Fase 1 ao abrir com o esquema novo', async () => {
    const name = `mig-${Math.random()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores(SCHEMA_V1);
    await v1.open();
    await v1.table('weights').put({ id: 'w1', date: '2026-11-17', measuredAt: '2026-11-17T10:00:00Z', weightKg: 99.5, createdAt: 'x', updatedAt: 'x' });
    await v1.table('exerciseSets').put({ id: 'e1', sessionId: 's1', exerciseName: 'Remada sentada', order: 0, reps: 10 });
    v1.close();
    const v2 = new CorpoDB(name);
    await v2.open();
    expect(v2.verno).toBe(2);
    expect((await v2.weights.get('w1'))?.weightKg).toBe(99.5);
    expect(await v2.exerciseSets.where('exerciseName').equals('Remada sentada').count()).toBe(1);
  });
});
