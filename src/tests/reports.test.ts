import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { CorpoDB, SCHEMA_V1 } from '../data/db';
import { completeOnboarding, deletePhoto, exportBackup, importBackup, logReview, savePhoto } from '../data/repo';
import { base64ToBuffer, bufferToBase64 } from '../domain/binary';
import {
  DEFAULT_REMINDERS, csvCell, dueReminders, monthlySummary, periodNutrition, reviewStatus, toCSV, weeklySummary, type ReportData, type ReminderInput,
} from '../domain/reports';
import { validateBackup } from '../domain/validations';
import { buildHtmlReport, esc } from '../features/reports/htmlReport';
import type { FoodLog, NutritionTargets, UserProfile, WeightEntry, WorkoutSession } from '../domain/types';

const T: NutritionTargets[] = [{ id: 't', effectiveDate: '2026-11-01', caloriesKcal: 2000, proteinG: 150, carbsG: 200, fatG: 67, waterMinMl: 2000, waterMaxMl: 3000, createdAt: '' }];
const W = (date: string, weightKg: number, note?: string): WeightEntry => ({ id: date + weightKg, date, measuredAt: `${date}T10:00:00Z`, weightKg, note, createdAt: '', updatedAt: '' });
const F = (date: string, kcal?: number, proteinG?: number): FoodLog => ({ id: `${date}-${kcal}-${proteinG}`, date, consumedAt: `${date}T12:00:00Z`, mealLabel: 'Almoço', description: 'x', amount: 1, unit: 'unit', kcal, proteinG, carbsG: kcal ? 100 : undefined, fatG: kcal ? 30 : undefined, nutritionIsEstimated: false, createdAt: '', updatedAt: '' });
const S = (id: string, date: string, status: WorkoutSession['status'], cardioMinutes?: number): WorkoutSession => ({ id, date, status, cardioMinutes, createdAt: '', updatedAt: '' });

function data(over: Partial<ReportData> = {}): ReportData {
  return {
    weights: [], foodLogs: [], targets: T, workouts: [], plans: [{ id: 'p', name: 'A', weekday: 1, type: 'strength', requiresClearance: true, order: 1 }],
    sets: [], recovery: [], measurements: [], photos: [],
    milestones: [{ id: 'm1', date: '2026-11-17', targetWeightKg: 100, updatedAt: '' }, { id: 'm2', date: '2026-12-17', targetWeightKg: 98, updatedAt: '' }],
    ...over,
  };
}

describe('Resumo semanal', () => {
  it('usa só registros reais e médias nos dias registrados', () => {
    const d = data({
      weights: [W('2026-11-16', 100.4), W('2026-11-18', 100.0, 'jejum'), W('2026-11-10', 101)],
      foodLogs: [F('2026-11-16', 2100, 160), F('2026-11-17', 1900, 140), F('2026-11-17', undefined, undefined)],
      workouts: [S('a', '2026-11-16', 'completed', 10), S('b', '2026-11-18', 'not_cleared', 30), S('c', '2026-11-19', 'partial', 20)],
      recovery: [{ id: 'r', date: '2026-11-17', sleepHours: 6.5, note: 'cansado', createdAt: '', updatedAt: '' }],
      measurements: [{ id: 'x', measuredOn: '2026-11-17', waistCm: 112, createdAt: '', updatedAt: '' }],
    });
    const s = weeklySummary(d, '2026-11-20');
    expect(s.weekStart).toBe('2026-11-16');
    expect(s.weightAvg).toBeCloseTo(100.2, 10);
    expect(s.weightCount).toBe(2);
    expect(s.deltaVsPrevious).toBeCloseTo(-0.8, 10);
    expect(s.nutrition).toMatchObject({ daysInPeriod: 7, daysLogged: 2, daysProteinHit: 1, daysWithMissingData: 1 });
    expect(s.nutrition.avgKcal).toBe(2000); // (2100 + 1900) / 2 dias registrados — não divide por 7
    expect(s.training).toMatchObject({ completed: 1, partial: 1, notCleared: 1, cardioMinutes: 30, planned: 1 });
    expect(s.sleepAvg).toBe(6.5);
    expect(s.latestWaist).toEqual({ date: '2026-11-17', cm: 112 });
    expect(s.notes.map((n) => n.text)).toEqual(['cansado', 'Peso: jejum']);
  });
  it('sem semana anterior → variação nula (dados insuficientes)', () => {
    expect(weeklySummary(data({ weights: [W('2026-11-16', 100)] }), '2026-11-16').deltaVsPrevious).toBeNull();
  });
  it('período sem alimentação não vira 0 kcal', () => {
    const n = periodNutrition([], T, '2026-11-16', '2026-11-22');
    expect(n.daysLogged).toBe(0);
    expect(n.avgKcal).toBeNull();
  });
});

describe('Resumo mensal', () => {
  it('compara com o marco do dia 17 e mede constância', () => {
    const d = data({
      weights: [W('2026-12-15', 98.6), W('2026-12-18', 98.2), W('2026-12-02', 99.5)],
      measurements: [{ id: 'a', measuredOn: '2026-11-17', waistCm: 112, createdAt: '', updatedAt: '' }, { id: 'b', measuredOn: '2026-12-17', waistCm: 110.5, createdAt: '', updatedAt: '' }],
      photos: [{ id: 'f', capturedOn: '2026-12-17', angle: 'front', photoKind: 'real', blobKey: 'f', createdAt: '' }, { id: 's', capturedOn: '2026-12-17', angle: 'front', photoKind: 'simulation', blobKey: 's', createdAt: '' }],
    });
    const m = monthlySummary(d, '2026-12', '2026-12-20');
    expect(m.expectedAtCheckpoint).toBe(98);
    expect(m.weightNearCheckpoint).toBeCloseTo(98.4, 10);
    expect(m.weightNearCount).toBe(2);
    expect(m.waist?.cm).toBe(110.5);
    expect(m.waistPrevious?.cm).toBe(112);
    expect(m.realPhotos).toBe(1);
    expect(m.daysElapsed).toBe(20);
    expect(m.daysWithAnyRecord).toBe(4);
  });
});

describe('Revisão e lembretes', () => {
  it('revisão vence aos 14 dias e atrasa após 21', () => {
    expect(reviewStatus(undefined, '2026-11-17', '2026-11-30').due).toBe(false);
    expect(reviewStatus(undefined, '2026-11-17', '2026-12-01').due).toBe(true);
    const s = reviewStatus([{ date: '2026-12-01' }], '2026-11-17', '2026-12-23');
    expect(s).toMatchObject({ due: true, overdue: true, daysSince: 22, lastDate: '2026-12-01' });
  });
  const base: ReminderInput = {
    today: '2026-11-18', nowHHMM: '08:30', settings: DEFAULT_REMINDERS, weightsThisWeek: 1, weighedToday: false,
    meals: [{ label: 'Café da manhã', time: '08:00' }, { label: 'Ceia', time: '00:15' }], loggedMeals: [],
    plannedWorkoutToday: { name: 'Musculação B', requiresClearance: true }, workoutLoggedToday: false, cleared: false,
    waistThisMonth: true, review: { due: false, overdue: false, daysSince: null, lastDate: null }, paused: false,
  };
  it('gera lembretes do momento, sem marcar nada como feito', () => {
    const r = dueReminders(base);
    expect(r.map((x) => x.id)).toEqual(['weigh', 'meal-Café da manhã', 'workout']);
    expect(r.find((x) => x.id === 'workout')!.text).toContain('não liberado');
  });
  it('respeita configurações, pausa e registros já feitos', () => {
    expect(dueReminders({ ...base, paused: true })).toEqual([]);
    expect(dueReminders({ ...base, weighedToday: true, loggedMeals: ['Café da manhã'], workoutLoggedToday: true })).toEqual([]);
    expect(dueReminders({ ...base, settings: { ...DEFAULT_REMINDERS, weighIn: false, meals: false, workouts: false } })).toEqual([]);
    expect(dueReminders({ ...base, today: '2026-11-19', weighedToday: true, loggedMeals: ['Café da manhã'], plannedWorkoutToday: null, waistThisMonth: false }).map((x) => x.id)).toEqual(['monthly']);
  });
});

describe('Exportação', () => {
  it('CSV pt-BR: BOM, ";" e vírgula decimal, aspas e proteção contra fórmulas', () => {
    const c = toCSV(['data', 'peso', 'nota'], [['2026-11-18', 112.6, 'a; "b"'], ['2026-11-19', undefined, '=1+1']]);
    expect(c.startsWith('﻿')).toBe(true);
    expect(c).toContain('2026-11-18;112,6;"a; ""b"""');
    expect(c).toContain("2026-11-19;;'=1+1");
    expect(csvCell(true)).toBe('sim');
  });
  it('HTML imprimível: autônomo, com dados reais, sem simulações e com escape', () => {
    const profile: UserProfile = { id: 'me', displayName: '<b>Ana</b>', sexForBmr: 'male', heightCm: 180, startDate: '2026-11-17', startWeightKg: 100, goalWeightKg: 90, targetDate: '2027-09-17', medicalClearanceConfirmed: false, createdAt: '', updatedAt: '' };
    const html = buildHtmlReport(data({ weights: [W('2026-11-18', 99.6), W('2026-11-20', 99.2)] }), { from: '2026-11-17', to: '2026-11-30', today: '2026-11-30', profile });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(html).toContain('<svg');
    expect(html).toContain('média de 2 registros');
    expect(html).not.toMatch(/https?:\/\//); // nenhum recurso externo
    expect(esc('"x"')).toBe('&quot;x&quot;');
  });
  it('base64 ida e volta', () => {
    const buf = new Uint8Array([0, 1, 2, 250, 255]).buffer;
    expect(new Uint8Array(base64ToBuffer(bufferToBase64(buf)))).toEqual(new Uint8Array(buf));
  });
});

let n = 0;
let database: CorpoDB;
beforeEach(async () => { database = new CorpoDB(`r-${++n}`); await database.open(); });
const onboard = () => completeOnboarding({ profile: { displayName: 'T', heightCm: 180, startWeightKg: 100, goalWeightKg: 90, startDate: '2026-11-17', targetDate: '2027-09-17' }, showWeight: true, showCalories: true, showWorkouts: true, showPhotos: true }, database);
const img = (b: number) => ({ type: 'image/jpeg', data: new Uint8Array([b, b, b]).buffer, thumb: new Uint8Array([b]).buffer });

describe('Fotos (persistência e backup)', () => {
  it('G13: rótulos real × simulação persistem; backup sem imagens não leva o binário', async () => {
    await onboard();
    const real = await savePhoto({ capturedOn: '2026-11-17', angle: 'front', photoKind: 'real' }, img(1), database);
    await savePhoto({ capturedOn: '2026-11-17', angle: 'front', photoKind: 'simulation', note: 'objetivo' }, img(2), database);
    const kinds = (await database.photos.toArray()).map((p) => p.photoKind).sort();
    expect(kinds).toEqual(['real', 'simulation']);
    const noImg = await exportBackup(database);
    expect(noImg.photos).toHaveLength(2);
    expect(noImg.photoBlobs).toHaveLength(0);
    const withImg = JSON.parse(JSON.stringify(await exportBackup(database, { includePhotos: true })));
    expect(withImg.photoBlobs).toHaveLength(2);
    expect(validateBackup(withImg).ok).toBe(true);
    await deletePhoto(real, database);
    expect(await database.photoBlobs.count()).toBe(1);
  });

  it('substituir com backup sem imagens mantém as fotos do aparelho; com imagens restaura tudo', async () => {
    await onboard();
    await savePhoto({ capturedOn: '2026-11-17', angle: 'side', photoKind: 'real' }, img(7), database);
    const v1 = validateBackup(JSON.parse(JSON.stringify(await exportBackup(database))));
    const v2 = validateBackup(JSON.parse(JSON.stringify(await exportBackup(database, { includePhotos: true }))));
    if (!v1.ok || !v2.ok) throw new Error('backup inválido');
    await importBackup(v1.data, 'replace', database);
    expect(await database.photos.count()).toBe(1);
    expect(await database.photoBlobs.count()).toBe(1);
    // aparelho novo: restaura imagens a partir do base64
    const fresh = new CorpoDB(`fresh-${n}`); await fresh.open();
    await importBackup(v2.data, 'replace', fresh);
    const b = await fresh.photoBlobs.toArray();
    expect(new Uint8Array(b[0].data)).toEqual(new Uint8Array([7, 7, 7]));
    // importar só metadados num aparelho sem as imagens não cria fotos “quebradas”
    const empty = new CorpoDB(`empty-${n}`); await empty.open();
    await importBackup(v1.data, 'merge', empty);
    expect(await empty.photos.count()).toBe(0);
  });

  it('registro de revisões fica nas configurações', async () => {
    await onboard();
    await logReview('2026-12-01', 'manter metas', database);
    await logReview('2026-12-01', 'manter metas (editado)', database);
    const s = await database.settings.get('app');
    expect(s?.reviewLog).toEqual([{ date: '2026-12-01', note: 'manter metas (editado)' }]);
  });
});

describe('Migração v1 → v3', () => {
  it('preserva os dados e cria as tabelas de fotos', async () => {
    const name = `mig3-${Math.random()}`;
    const v1 = new Dexie(name); v1.version(1).stores(SCHEMA_V1); await v1.open();
    await v1.table('weights').put(W('2026-11-17', 101.2));
    v1.close();
    const cur = new CorpoDB(name); await cur.open();
    expect(cur.verno).toBeGreaterThanOrEqual(3);
    expect((await cur.weights.toArray())[0].weightKg).toBe(101.2);
    expect(await cur.photos.count()).toBe(0);
  });
});
