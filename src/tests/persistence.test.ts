import { beforeEach, describe, expect, it } from 'vitest';
import { CorpoDB } from '../data/db';
import {
  clearAllData, completeOnboarding, deleteWeight, exportBackup, importBackup, saveFoodLog, saveTargets, saveWeight,
  setHabitCompletion,
} from '../data/repo';
import { latestWeight, progressToGoal, weeklyAverages } from '../domain/calculations';
import { validateBackup } from '../domain/validations';

let n = 0;
let database: CorpoDB;

beforeEach(async () => {
  database = new CorpoDB(`test-${++n}`);
  await database.open();
});

const EXAMPLE_PROFILE = { displayName: 'Teste', ageAtStart: 30, sexForBmr: 'male' as const, heightCm: 180, startDate: '2026-11-17', startWeightKg: 100, goalWeightKg: 82, targetDate: '2027-09-17' };
const onboard = () => completeOnboarding({ profile: EXAMPLE_PROFILE, showWeight: true, showCalories: true, showWorkouts: true, showPhotos: false }, database);

describe('Plano inicial', () => {
  it('carrega configuração padrão sem criar pesagens, refeições, treinos ou marcações', async () => {
    await onboard();
    const p = await database.profile.get('me');
    expect(p).toMatchObject({ startWeightKg: 100, goalWeightKg: 82, heightCm: 180, startDate: '2026-11-17', targetDate: '2027-09-17', medicalClearanceConfirmed: false });
    expect(await database.milestones.count()).toBe(2);
    expect(await database.weights.count()).toBe(0);
    expect(await database.foodLogs.count()).toBe(0);
    expect(await database.workouts.count()).toBe(0);
    expect(await database.completions.count()).toBe(0);
    const t = await database.targets.toArray();
    expect(t[0]).toMatchObject({ caloriesKcal: 2000, proteinG: 150, carbsG: 200, fatG: 67 });
    // catálogo vem da base oficial (TACO/IBGE), cada item com fonte
    const foods = await database.foodItems.toArray();
    expect(foods.length).toBeGreaterThan(30);
    expect(foods.every((f) => f.builtin && f.source && (f.source.startsWith('TACO') || f.source.startsWith('IBGE')))).toBe(true);
    // todos os treinos (exceto descanso) exigem liberação
    const plans = await database.workoutPlans.toArray();
    expect(plans.filter((pl) => pl.type !== 'rest').every((pl) => pl.requiresClearance)).toBe(true);
  });
});

describe('Pesagens', () => {
  it('grava 99,0 kg e o valor persiste ao reabrir o banco', async () => {
    await onboard();
    await saveWeight({ date: '2026-11-18', time: '07:10', weightKg: 99.0, measuredAt: '2026-11-18T10:10:00.000Z' }, database);
    database.close();
    const reopened = new CorpoDB(database.name);
    await reopened.open();
    const all = await reopened.weights.toArray();
    expect(all).toHaveLength(1);
    const cur = latestWeight(all)!;
    expect(cur.weightKg).toBe(99.0);
    expect(progressToGoal(100, cur.weightKg, 82).percentClamped.toFixed(1)).toBe('5.6');
    database = reopened;
  });

  it('editar e excluir recalcula médias sem duplicar', async () => {
    const id = await saveWeight({ date: '2026-11-17', weightKg: 100, measuredAt: '2026-11-17T10:00:00Z' }, database);
    await saveWeight({ date: '2026-11-19', weightKg: 99, measuredAt: '2026-11-19T10:00:00Z' }, database);
    await saveWeight({ id, date: '2026-11-17', weightKg: 99.8, measuredAt: '2026-11-17T10:00:00Z' }, database);
    let all = await database.weights.toArray();
    expect(all).toHaveLength(2);
    expect(weeklyAverages(all)[0].averageKg).toBeCloseTo(99.4, 10);
    await deleteWeight(id, database);
    all = await database.weights.toArray();
    expect(all).toHaveLength(1);
    expect(weeklyAverages(all)[0]).toMatchObject({ count: 1, averageKg: 99 });
  });
});

describe('Metas nutricionais', () => {
  it('nova versão preserva o histórico anterior', async () => {
    await onboard();
    await saveTargets({ effectiveDate: '2026-12-10', caloriesKcal: 2350, proteinG: 180, carbsG: 230, fatG: 80, waterMinMl: 2500, waterMaxMl: 3500 }, database);
    const all = await database.targets.toArray();
    expect(all).toHaveLength(2);
    // regravar na mesma data substitui só a versão daquela data
    await saveTargets({ effectiveDate: '2026-12-10', caloriesKcal: 2400, proteinG: 180, carbsG: 242, fatG: 80, waterMinMl: 2500, waterMaxMl: 3500 }, database);
    expect(await database.targets.count()).toBe(2);
  });
});

describe('Backup JSON', () => {
  async function populated() {
    await onboard();
    await saveWeight({ date: '2026-11-18', weightKg: 99.6, measuredAt: '2026-11-18T10:00:00Z', note: 'jejum' }, database);
    await saveFoodLog({ date: '2026-11-18', consumedAt: '2026-11-18T11:00:00Z', mealLabel: 'Café da manhã', description: 'Ovo', amount: 3, unit: 'unit', nutritionIsEstimated: false }, database);
    const habit = (await database.habits.toArray())[0];
    await setHabitCompletion(habit, '2026-11-18', true, database);
  }

  it('exporta JSON válido e restaura valores idênticos', async () => {
    await populated();
    const backup = JSON.parse(JSON.stringify(await exportBackup(database)));
    const v = validateBackup(backup);
    expect(v.ok).toBe(true);
    await clearAllData(database);
    expect(await database.weights.count()).toBe(0);
    if (v.ok) await importBackup(v.data, 'replace', database);
    const w = await database.weights.toArray();
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ weightKg: 99.6, note: 'jejum', date: '2026-11-18' });
    expect(await database.foodLogs.count()).toBe(1);
    expect(await database.completions.count()).toBe(1);
    expect((await database.profile.get('me'))?.goalWeightKg).toBe(82);
  });

  it('importar o mesmo backup duas vezes (mesclar) não duplica', async () => {
    await populated();
    const backup = JSON.parse(JSON.stringify(await exportBackup(database)));
    const v = validateBackup(backup);
    if (!v.ok) throw new Error('backup inválido');
    const before = { w: await database.weights.count(), f: await database.foodLogs.count(), m: await database.milestones.count(), h: await database.habits.count() };
    await importBackup(v.data, 'merge', database);
    await importBackup(v.data, 'merge', database);
    expect(await database.weights.count()).toBe(before.w);
    expect(await database.foodLogs.count()).toBe(before.f);
    expect(await database.milestones.count()).toBe(before.m);
    expect(await database.habits.count()).toBe(before.h);
  });

  it('apagar, reinstalar plano e mesclar backup não duplica catálogo, hábitos e marcos', async () => {
    await populated();
    const backup = JSON.parse(JSON.stringify(await exportBackup(database)));
    const v = validateBackup(backup);
    if (!v.ok) throw new Error('backup inválido');
    const before = { h: await database.habits.count(), m: await database.milestones.count(), fi: await database.foodItems.count(), p: await database.workoutPlans.count() };
    await clearAllData(database);
    await onboard();
    await importBackup(v.data, 'merge', database);
    expect(await database.habits.count()).toBe(before.h);
    expect(await database.milestones.count()).toBe(before.m);
    expect(await database.foodItems.count()).toBe(before.fi);
    expect(await database.workoutPlans.count()).toBe(before.p);
    expect(await database.weights.count()).toBe(1);
    expect(await database.completions.count()).toBe(1);
  });

  it('rejeita arquivo inválido com mensagens legíveis', () => {
    const v = validateBackup({ app: 'outro', weights: [{ weightKg: 'abc' }] });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors.length).toBeGreaterThan(0);
    const v2 = validateBackup({ app: 'corpo-atletico-2027', schemaVersion: 1, exportedAt: '2026-11-18T00:00:00Z', profile: null, settings: null, weights: [{ id: 'x', date: '2026-13-40', measuredAt: 'x', weightKg: 99, createdAt: 'x', updatedAt: 'x' }] });
    expect(v2.ok).toBe(false);
  });
});
