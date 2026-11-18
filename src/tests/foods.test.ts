import { beforeEach, describe, expect, it } from 'vitest';
import { CorpoDB } from '../data/db';
import { REFERENCE_FOODS, SOURCE_IBGE, SOURCE_TACO } from '../data/foodDatabase';
import { addFoodPortion, completeOnboarding, duplicateFood, exportBackup, importBackup, saveFoodItem, saveFoodLogs, setFoodFavorite, syncReferenceFoods } from '../data/repo';
import { dayTotals, kcalFromMacros, nutrientsForAmount } from '../domain/calculations';
import { proteinFillers, proteinPer100kcal, recentFoodIds, remainingForDay } from '../domain/nutrition';
import { validateBackup } from '../domain/validations';

const byId = (id: string) => REFERENCE_FOODS.find((f) => f.id === id)!;

describe('Base de alimentos (TACO/IBGE)', () => {
  it('cada item tem fonte oficial, nome da tabela e valores plausíveis', () => {
    const ids = new Set<string>();
    for (const f of REFERENCE_FOODS) {
      expect(ids.has(f.id)).toBe(false); ids.add(f.id);
      expect([SOURCE_TACO, SOURCE_IBGE]).toContain(f.source);
      expect(f.tableName.length).toBeGreaterThan(5);
      for (const v of [f.kcal, f.protein, f.carbs, f.fat]) expect(v).toBeGreaterThanOrEqual(0);
      // As tabelas usam fatores de conversão próprios e descontam fibras (ex.: extrato de tomate, ~17%);
      // a soma P×4+C×4+G×9 deve ficar próxima do valor publicado — serve para pegar erro de digitação.
      const est = kcalFromMacros(f.protein, f.carbs, f.fat);
      if (f.kcal > 40) expect(Math.abs(est - f.kcal) / f.kcal).toBeLessThan(0.2);
    }
  });
  it('contém as proteínas do dia a dia do usuário e nenhum whey/peixe', () => {
    const everyday = REFERENCE_FOODS.filter((f) => f.everyday && f.group === 'protein').map((f) => f.name.toLowerCase()).join(' | ');
    for (const k of ['filé de frango grelhado', 'contra-filé', 'milanesa', 'ovo', 'acém', 'coxa', 'sobrecoxa', 'ao molho']) expect(everyday).toContain(k);
    const all = REFERENCE_FOODS.map((f) => `${f.name} ${f.tableName}`.toLowerCase()).join(' ');
    for (const k of ['whey', 'peixe', 'pescado', 'atum', 'sardinha', 'tilápia', 'camarão']) expect(all).not.toContain(k);
  });
  it('valores conferidos nas tabelas oficiais (amostra)', () => {
    expect(byId('ref-file-frango-grelhado')).toMatchObject({ kcal: 159, protein: 32.0, carbs: 0, fat: 2.5 });
    expect(byId('ref-contra-file-sem-gordura')).toMatchObject({ kcal: 194, protein: 35.9, fat: 4.5 });
    expect(byId('ref-carne-panela-acem')).toMatchObject({ kcal: 215, protein: 27.3, fat: 10.9 });
    expect(byId('ref-coxa-assada-pele')).toMatchObject({ kcal: 215, protein: 28.5, fat: 10.4 });
    expect(byId('ref-sobrecoxa-assada-pele')).toMatchObject({ kcal: 260, protein: 28.7, fat: 15.2 });
    expect(byId('ref-frango-milanesa')).toMatchObject({ kcal: 211.84, protein: 31.37, carbs: 3.39, fat: 7.12 });
    expect(byId('ref-frango-molho-pedacos')).toMatchObject({ kcal: 196.0, protein: 22.10, fat: 10.92 });
    expect(byId('ref-ovo-frito')).toMatchObject({ kcal: 222.59, protein: 13.67 });
    expect(byId('ref-arroz-branco')).toMatchObject({ kcal: 128, carbs: 28.1 });
    expect(byId('ref-feijao-carioca')).toMatchObject({ kcal: 76, protein: 4.8 });
  });
  it('calcula kcal e macros pela quantidade', () => {
    const f = byId('ref-file-frango-grelhado');
    const n = nutrientsForAmount({ referenceAmount: 100, referenceUnit: 'g', kcalPerReference: f.kcal, proteinGPerReference: f.protein, carbsGPerReference: f.carbs, fatGPerReference: f.fat }, 150, 'g')!;
    expect(n.kcal).toBeCloseTo(238.5, 6);
    expect(n.proteinG).toBeCloseTo(48, 6);
    expect(n.nutritionIsEstimated).toBe(false);
  });
});

describe('Ajudas do diário', () => {
  const foods = [
    { id: 'a', name: 'Filé', referenceAmount: 100, referenceUnit: 'g' as const, kcalPerReference: 159, proteinGPerReference: 32, createdAt: '', updatedAt: '' },
    { id: 'b', name: 'Sobrecoxa', referenceAmount: 100, referenceUnit: 'g' as const, kcalPerReference: 260, proteinGPerReference: 28.7, createdAt: '', updatedAt: '' },
    { id: 'c', name: 'Sem dados', referenceAmount: 100, referenceUnit: 'g' as const, createdAt: '', updatedAt: '' },
  ];
  it('quanto de cada proteína cobre o que falta (arredonda a 10 g, menos kcal primeiro)', () => {
    const r = proteinFillers(45, foods);
    expect(r.map((x) => x.food.id)).toEqual(['a', 'b']);
    expect(r[0].amount).toBe(150); // 45/32*100 = 140,6 → 150 g
    expect(r[0].proteinG).toBeGreaterThanOrEqual(45);
    expect(proteinFillers(2, foods)).toEqual([]);
    expect(proteinFillers(200, foods, 400)).toEqual([]); // acima de 400 g não sugere
  });
  it('restante do dia e densidade proteica', () => {
    expect(remainingForDay({ kcal: 2000, proteinG: 150, carbsG: 200, fatG: 90 }, { id: 't', effectiveDate: '', caloriesKcal: 2500, proteinG: 180, carbsG: 265, fatG: 80, waterMinMl: 0, waterMaxMl: 0, createdAt: '' }))
      .toEqual({ kcal: 500, proteinG: 30, carbsG: 65, fatG: -10 });
    expect(proteinPer100kcal({ kcalPerReference: 159, proteinGPerReference: 32 })).toBeCloseTo(20.13, 2);
  });
  it('recentes sem repetição, mais novos primeiro', () => {
    expect(recentFoodIds([{ foodId: 'a', createdAt: '1' }, { foodId: 'b', createdAt: '3' }, { foodId: 'a', createdAt: '2' }, { createdAt: '4' }])).toEqual(['b', 'a']);
  });
});

let n = 0;
let database: CorpoDB;
beforeEach(async () => { database = new CorpoDB(`f-${++n}`); await database.open(); });
const onboard = () => completeOnboarding({ profile: { displayName: 'T', heightCm: 180, startWeightKg: 100, goalWeightKg: 90, startDate: '2026-11-17', targetDate: '2027-09-17' }, showWeight: true, showCalories: true, showWorkouts: true, showPhotos: false }, database);

describe('Sincronização da base no aparelho', () => {
  it('é idempotente, preserva favoritos/porções e remove itens-semente vazios antigos', async () => {
    await database.foodItems.put({ id: 'seed-food-8', name: 'Whey protein (dose)', referenceAmount: 30, referenceUnit: 'g', createdAt: '', updatedAt: '' });
    await saveFoodItem({ name: 'Brownie da casa', referenceAmount: 50, referenceUnit: 'g', kcalPerReference: 210, source: 'minha receita' }, database);
    const first = await syncReferenceFoods(database);
    expect(first.added).toBe(REFERENCE_FOODS.length);
    expect(first.removed).toBe(1);
    expect(await database.foodItems.get('seed-food-8')).toBeUndefined();
    await setFoodFavorite('ref-patinho-grelhado', true, database);
    await setFoodFavorite('ref-ovo-cozido', false, database);
    await addFoodPortion('ref-file-frango-grelhado', { label: '1 filé', amount: 120 }, database);
    const again = await syncReferenceFoods(database);
    expect(again).toEqual({ added: 0, updated: 0, removed: 0 });
    expect((await database.foodItems.get('ref-patinho-grelhado'))?.favorite).toBe(true);
    expect((await database.foodItems.get('ref-ovo-cozido'))?.favorite).toBe(false);
    expect((await database.foodItems.get('ref-file-frango-grelhado'))?.portions).toEqual([{ label: '1 filé', amount: 120 }]);
    expect((await database.foodItems.toArray()).some((f) => f.name === 'Brownie da casa')).toBe(true);
  });

  it('versão personalizada não altera a base oficial', async () => {
    await onboard();
    const id = await duplicateFood('ref-frango-milanesa', { name: 'Milanesa da minha mãe', kcalPerReference: 250 }, database);
    expect((await database.foodItems.get(id))).toMatchObject({ kcalPerReference: 250, proteinGPerReference: 31.37, favorite: true });
    expect((await database.foodItems.get(id))?.builtin).toBeUndefined();
    expect((await database.foodItems.get('ref-frango-milanesa'))?.kcalPerReference).toBe(211.84);
  });

  it('prato rápido grava vários itens e o backup continua válido', async () => {
    await onboard();
    const items = [['ref-arroz-branco', 150], ['ref-feijao-carioca', 150], ['ref-contra-file-sem-gordura', 170]] as const;
    const logs = [];
    for (const [fid, g] of items) {
      const f = (await database.foodItems.get(fid))!;
      logs.push({ date: '2026-11-18', consumedAt: '2026-11-18T15:00:00Z', mealLabel: 'Almoço', foodId: fid, description: f.name, amount: g, unit: 'g' as const, ...nutrientsForAmount(f, g, 'g')! });
    }
    expect(await saveFoodLogs(logs, database)).toBe(3);
    const t = dayTotals(await database.foodLogs.toArray());
    // 150 g arroz (192) + 150 g feijão (114) + 170 g contra-filé (329,8)
    expect(t.kcal).toBeCloseTo(192 + 114 + 329.8, 6);
    expect(t.itemsMissingKcal).toBe(0);
    const v = validateBackup(JSON.parse(JSON.stringify(await exportBackup(database))));
    expect(v.ok).toBe(true);
    const fresh = new CorpoDB(`ff-${n}`); await fresh.open();
    if (v.ok) await importBackup(v.data, 'replace', fresh);
    expect(await fresh.foodItems.count()).toBe(REFERENCE_FOODS.length);
  });
});
