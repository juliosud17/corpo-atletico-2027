import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { CorpoDB } from '../data/db';
import { REFERENCE_FOODS, referenceToFoodItem } from '../data/foodDatabase';
import { DEFAULT_RECIPE_CATEGORIES, defaultSettings } from '../data/seed';
import {
  deleteRecipeCategory, exportBackup, importBackup, importRecipePack, saveRecipeCategory, setRecipeFavorite, syncRecipeCategories,
} from '../data/repo';
import { eatenFromRecipe, formatQty, ingredientDisplay, recipeNutrition, scaleMeasure } from '../domain/recipes';
import type { FoodItem, Recipe } from '../domain/types';
import { recipePackSchema, validateBackup } from '../domain/validations';

const now = '2026-11-18T12:00:00.000Z';
const foods: FoodItem[] = REFERENCE_FOODS.map((r) => referenceToFoodItem(r, now));
const IMG = 'data:image/jpeg;base64,/9j/4AAQ';

const base: Recipe = {
  id: 'pack-teste', name: 'Teste', servings: 4, createdAt: now, updatedAt: now,
  ingredients: [
    { id: 'a', text: '400 g de peito de frango cru', name: 'Peito de frango cru', measure: '2 unidades', grams: 400, foodId: 'ref-frango-peito-cru', amount: 400 },
    { id: 'b', text: 'sal', name: 'Sal', measure: '1 colher de chá', grams: 6, ignored: true },
  ],
};

describe('Valor nutricional efetivo da receita', () => {
  it('usa a conta TACO quando todos os ingredientes têm dados', () => {
    const n = recipeNutrition(base, foods);
    expect(n.basis).toBe('taco');
    expect(n.perServing.kcal).toBeCloseTo((400 * 119) / 100 / 4, 5); // TACO: peito cru 119 kcal/100 g
  });
  it('com ingrediente pendente, usa os valores informados pela receita', () => {
    const r: Recipe = { ...base, ingredients: [...base.ingredients, { id: 'c', text: '100 g de tomate seco', name: 'Tomate seco', grams: 100 }],
      declared: { kcal: 300, proteinG: 25, carbsG: 10, fatG: 5, fiberG: 1, source: 'Fonte X' } };
    const n = recipeNutrition(r, foods);
    expect(n.basis).toBe('declared');
    expect(n.perServing.kcal).toBe(300);
    expect(n.perServing.fiberG).toBe(1);
    expect(n.taco.kcal).toBeCloseTo(119, 5); // conta parcial continua disponível
    expect(n.totals.pending).toBe(1);
    expect(eatenFromRecipe(n, 1.5, 'portions')?.kcal).toBe(450);
  });
  it('sem valores informados, a conta parcial é sinalizada', () => {
    const r: Recipe = { ...base, ingredients: [...base.ingredients, { id: 'c', text: 'tomate seco' }] };
    expect(recipeNutrition(r, foods).basis).toBe('partial');
  });
  it('gramas do preparo pronto exigem peso pronto', () => {
    const n = recipeNutrition(base, foods);
    expect(eatenFromRecipe(n, 200, 'grams')).toBeNull();
    const n2 = recipeNutrition({ ...base, cookedWeightG: 800 }, foods);
    expect(eatenFromRecipe(n2, 200, 'grams')?.kcal).toBeCloseTo(n2.perServing.kcal, 5);
  });
});

describe('Escala de quantidades', () => {
  it.each([[0.5, '½'], [1.25, '1 ¼'], [2, '2'], [2.4, '2,4'], [0.75, '¾'], [1 / 3, '⅓']])('formatQty(%s) = %s', (q, s) => expect(formatQty(q)).toBe(s));
  it.each([
    ['½ xícara', 2, '1 xícara'],
    ['4 unidades', 0.5, '2 unidades'],
    ['1 pote', 1.5, '1 ½ pote'],
    ['a gosto', 2, 'a gosto'],
    ['½ colher de sopa', 1, '½ colher de sopa'],
  ])('scaleMeasure(%s × %s) = %s', (m, f, out) => expect(scaleMeasure(m, f)).toBe(out));
  it('exibe nome, medida e gramas escalados', () => {
    expect(ingredientDisplay(base.ingredients[0], 1)).toEqual({ name: 'Peito de frango cru', measure: '2 unidades (400 g)' });
    expect(ingredientDisplay(base.ingredients[0], 1.5)).toEqual({ name: 'Peito de frango cru', measure: '3 unidades (600 g)' });
    expect(ingredientDisplay({ id: 'x', text: '200 g de arroz' }, 2).name).toBe('400 g de arroz');
  });
});

let database: CorpoDB; let n = 0;
beforeEach(async () => {
  database = new CorpoDB(`pack-${++n}`);
  await database.settings.put({ ...defaultSettings(now), onboardingDone: true });
});

describe('Categorias e pacote de receitas', () => {
  it('cria as categorias padrão uma vez e não recria as apagadas', async () => {
    expect(await syncRecipeCategories(database)).toBe(DEFAULT_RECIPE_CATEGORIES.length);
    expect(await syncRecipeCategories(database)).toBe(0);
    await deleteRecipeCategory('seed-cat-aveia', database);
    await syncRecipeCategories(database);
    expect(await database.recipeCategories.get('seed-cat-aveia')).toBeUndefined();
    expect((await database.recipeCategories.orderBy('order').first())?.name).toBe('1 Panela');
  });

  it('excluir categoria tira a categoria das receitas, sem apagá-las', async () => {
    await syncRecipeCategories(database);
    await database.recipes.put({ ...base, categoryIds: ['seed-cat-1-panela', 'seed-cat-marmitas'] });
    await deleteRecipeCategory('seed-cat-1-panela', database);
    expect((await database.recipes.get(base.id))?.categoryIds).toEqual(['seed-cat-marmitas']);
  });

  it('importa o pacote sem duplicar e preserva favorito e foto do usuário', async () => {
    await syncRecipeCategories(database);
    await saveRecipeCategory({ id: 'seed-cat-airfryer', name: 'Airfryer', image: IMG }, database);
    const pack = recipePackSchema.parse({
      app: 'corpo-atletico-2027', kind: 'recipe-pack', version: 1,
      categories: [{ id: 'seed-cat-1-panela', name: '1 Panela', order: 0, image: IMG, createdAt: now, updatedAt: now },
        { id: 'seed-cat-airfryer', name: 'Airfryer', order: 3, createdAt: now, updatedAt: now }],
      recipes: [{ ...base, image: IMG, categoryIds: ['seed-cat-1-panela'], steps: ['Passo'], prepMinutes: 60 }],
    });
    await importRecipePack(pack, database);
    await setRecipeFavorite(base.id, true, database);
    await importRecipePack(pack, database);
    expect(await database.recipes.count()).toBe(1);
    expect((await database.recipes.get(base.id))?.favorite).toBe(true);
    expect((await database.recipeCategories.get('seed-cat-airfryer'))?.image).toBe(IMG);
    expect((await database.recipeCategories.get('seed-cat-1-panela'))?.image).toBe(IMG);
    expect(await database.recipeCategories.count()).toBe(DEFAULT_RECIPE_CATEGORIES.length);
  });

  it('recusa arquivo que não é pacote de receitas', () => {
    expect(recipePackSchema.safeParse({ app: 'corpo-atletico-2027', recipes: [] }).success).toBe(false);
    expect(recipePackSchema.safeParse({ app: 'corpo-atletico-2027', kind: 'recipe-pack', version: 1, recipes: [{ ...base, image: 'javascript:alert(1)' }] }).success).toBe(false);
  });

  it('backup leva receitas com foto e categorias (ida e volta)', async () => {
    await syncRecipeCategories(database);
    await database.recipes.put({ ...base, image: IMG, categoryIds: ['seed-cat-marmitas'], declared: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, source: 'x' } });
    const b = await exportBackup(database);
    const v = validateBackup(JSON.parse(JSON.stringify(b)));
    expect(v.ok).toBe(true);
    const other = new CorpoDB(`pack-dest-${n}`);
    if (v.ok) await importBackup(v.data, 'replace', other);
    expect(await other.recipeCategories.count()).toBe(DEFAULT_RECIPE_CATEGORIES.length);
    expect((await other.recipes.get(base.id))?.image).toBe(IMG);
  });
});
