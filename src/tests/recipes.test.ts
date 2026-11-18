import { describe, expect, it } from 'vitest';
import { REFERENCE_FOODS, referenceToFoodItem } from '../data/foodDatabase';
import { defaultSplits, effectiveSplits, mealStatus, mealTargets } from '../domain/meals';
import {
  buildIngredients, consumedFromRecipe, convertAmount, formatPortions, matchFood, parseIngredientLine, parseRecipeHtml, parseRecipeText,
  perServing, recipeTotals, suggestPortions,
} from '../domain/recipes';
import type { FoodItem, NutritionTargets } from '../domain/types';

const foods: FoodItem[] = REFERENCE_FOODS.map((r) => referenceToFoodItem(r, '2026-11-18T00:00:00Z'));
let k = 0; const id = () => `i${++k}`;

describe('Linhas de ingrediente', () => {
  it.each([
    ['500 g de peito de frango', 500, 'g', 'peito de frango'],
    ['1 kg de acém em cubos', 1, 'kg', 'acém em cubos'],
    ['2 xícaras (chá) de arroz', 2, 'xicara', 'arroz'],
    ['1 e 1/2 xícara de leite', 1.5, 'xicara', 'leite'],
    ['½ cebola picada', 0.5, 'unidade', 'cebola picada'],
    ['3 colheres (sopa) de azeite', 3, 'colher_sopa', 'azeite'],
    ['2 dentes de alho', 2, 'dente', 'alho'],
    ['3 ovos', 3, 'unidade', 'ovos'],
    ['200ml de leite', 200, 'ml', 'leite'],
    ['1,5 kg de coxa e sobrecoxa', 1.5, 'kg', 'coxa e sobrecoxa'],
    ['uma pitada de sal', 1, 'pitada', 'sal'],
  ])('“%s”', (line, q, unit, name) => {
    const p = parseIngredientLine(line);
    expect(p.quantity).toBeCloseTo(q as number, 6);
    expect(p.unit).toBe(unit);
    expect(p.name).toBe(name);
  });
  it('“sal a gosto” vira a_gosto', () => expect(parseIngredientLine('Sal a gosto').unit).toBe('a_gosto'));
});

describe('Ligação com a base', () => {
  it.each([
    ['peito de frango em cubos', 'ref-frango-peito-cru'],
    ['filé de frango', 'ref-frango-peito-cru'],
    ['coxa e sobrecoxa', 'ref-frango-sobrecoxa-crua'],
    ['coxas de frango', 'ref-frango-coxa-crua'],
    ['acém em cubos', 'ref-acem-cru'],
    ['carne moída', 'ref-acem-moido-cru'],
    ['contra-filé', 'ref-contra-file-cru-gordura'],
    ['arroz', 'ref-arroz-cru'],
    ['feijão carioca', 'ref-feijao-carioca-cru'],
    ['farinha de rosca', 'ref-farinha-rosca'],
    ['farinha de trigo', 'ref-farinha-trigo'],
    ['cebola picada', 'ref-cebola'],
    ['azeite', 'ref-azeite'],
    ['óleo', 'ref-oleo-soja'],
    ['extrato de tomate', 'ref-extrato-tomate'],
    ['tomates maduros', 'ref-tomate'],
  ])('%s → %s', (name, expected) => expect(matchFood(name, foods)).toBe(expected));
  it('não liga itens sem dado confiável (creme de leite, leite condensado, clara)', () => {
    expect(matchFood('creme de leite', foods)).toBeUndefined();
    expect(matchFood('leite condensado', foods)).toBeUndefined();
    expect(matchFood('claras', foods)).toBeUndefined();
  });
});

describe('Conversões (só as exatas)', () => {
  const f = (id: string) => foods.find((x) => x.id === id)!;
  it('massa e volume para itens em ml', () => {
    expect(convertAmount({ quantity: 1.5, unit: 'kg', name: '' }, f('ref-acem-cru'))).toBe(1500);
    expect(convertAmount({ quantity: 1, unit: 'xicara', name: 'leite' }, f('ref-leite-integral'))).toBe(240);
  });
  it('óleos: volume × densidade 0,92', () => {
    expect(convertAmount({ quantity: 2, unit: 'colher_sopa', name: 'azeite' }, f('ref-azeite'))).toBeCloseTo(27.6, 6);
  });
  it('xícara de arroz cru não é convertida às cegas', () => {
    expect(convertAmount({ quantity: 2, unit: 'xicara', name: 'arroz' }, f('ref-arroz-cru'))).toBeUndefined();
  });
  it('unidade usa a porção salva pelo usuário', () => {
    const ovo = { ...f('ref-ovo-cru'), portions: [{ label: '1 ovo', amount: 50 }] };
    expect(convertAmount({ quantity: 3, unit: 'unidade', name: 'ovos' }, ovo)).toBe(150);
    expect(convertAmount({ quantity: 3, unit: 'unidade', name: 'ovos' }, f('ref-ovo-cru'))).toBeUndefined();
  });
});

const PASTED = `Frango ao molho da vó
Rendimento: 6 porções
Ingredientes
- 1 kg de peito de frango em cubos
- 2 colheres (sopa) de azeite
- 1 cebola picada
- 3 dentes de alho
- 340 g de extrato de tomate
- Sal a gosto
- Cheiro-verde a gosto
Modo de preparo
1. Tempere o frango com sal.
2. Refogue a cebola e o alho no azeite.
https://www.exemplo.com.br/receita/frango-ao-molho`;

describe('Receita colada', () => {
  it('lê título, rendimento, ingredientes e link; ignora o modo de preparo', () => {
    const r = parseRecipeText(PASTED);
    expect(r.name).toBe('Frango ao molho da vó');
    expect(r.servings).toBe(6);
    expect(r.ingredients).toHaveLength(7);
    expect(r.ingredients.some((l) => /Tempere/.test(l))).toBe(false);
    expect(r.sourceUrl).toBe('https://www.exemplo.com.br/receita/frango-ao-molho');
  });
  it('calcula totais, marca pendências e porções por refeição', () => {
    const r = parseRecipeText(PASTED);
    const ingredients = buildIngredients(r.ingredients, foods, id);
    const byText = (t: string) => ingredients.find((i) => i.text.includes(t))!;
    expect(byText('peito de frango')).toMatchObject({ foodId: 'ref-frango-peito-cru', amount: 1000 });
    expect(byText('azeite').amount).toBeCloseTo(27.6, 6);
    expect(byText('cebola')).toMatchObject({ foodId: 'ref-cebola', amount: undefined }); // 1 cebola: peso não informado
    expect(byText('Sal').ignored).toBe(true);
    expect(byText('Cheiro-verde').ignored).toBe(true);
    const t = recipeTotals({ ingredients }, foods);
    expect(t.pending).toBe(2); // cebola e alho sem peso
    // frango 1000 g (1190) + azeite 27,6 g (243,98) + extrato 340 g (207,4)
    expect(t.kcal).toBeCloseTo(1190 + 27.6 * 8.84 + 340 * 0.61, 4);
    const ps = perServing(t, { servings: 6, cookedWeightG: 1200 });
    expect(ps.grams).toBe(200);
    const sug = suggestPortions(ps, 648)!;
    expect(sug.portions % 0.25).toBe(0);
    expect(Math.abs(sug.kcal - 648)).toBeLessThanOrEqual(ps.kcal / 8 + 0.001);
    expect(consumedFromRecipe(t, { servings: 6, cookedWeightG: 1200 }, 300, 'grams')!.kcal).toBeCloseTo(t.kcal / 4, 6);
    expect(consumedFromRecipe(t, { servings: 6 }, 300, 'grams')).toBeNull(); // sem peso pronto não há conta por grama
    expect(formatPortions(1.5)).toBe('1 ½ porções');
  });
});

describe('Página com schema.org', () => {
  it('lê JSON-LD Recipe (inclusive dentro de @graph)', () => {
    const html = `<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Recipe","name":"Carne de panela","recipeYield":"4 porções","recipeIngredient":["800 g de acém","1 cebola","2 colheres de sopa de óleo"]}]}</script></html>`;
    const r = parseRecipeHtml(html, 'https://x.com/r')!;
    expect(r).toMatchObject({ name: 'Carne de panela', servings: 4, sourceUrl: 'https://x.com/r' });
    expect(r.ingredients).toHaveLength(3);
    expect(parseRecipeHtml('<html></html>')).toBeNull();
  });
});

describe('Metas por refeição', () => {
  const T: NutritionTargets = { id: 't', effectiveDate: '2026-11-17', caloriesKcal: 2500, proteinG: 180, carbsG: 265, fatG: 80, waterMinMl: 0, waterMaxMl: 0, createdAt: '' };
  const meals = [{ label: 'Café da manhã' }, { label: 'Almoço' }, { label: 'Lanche' }, { label: 'Jantar' }, { label: 'Ceia' }];
  it('padrão soma 100% e respeita o peso das refeições', () => {
    const d = defaultSplits(meals);
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(100);
    expect(d['Almoço']).toBeGreaterThan(d['Lanche']);
    const mt = mealTargets(meals, T);
    expect(mt.reduce((a, m) => a + m.kcal, 0)).toBeCloseTo(2500, 6);
    expect(mt.reduce((a, m) => a + m.proteinG, 0)).toBeCloseTo(180, 6);
  });
  it('usa os percentuais salvos só quando somam 100%', () => {
    const saved = { 'Café da manhã': 25, Almoço: 30, Lanche: 10, Jantar: 25, Ceia: 10 };
    expect(effectiveSplits(meals, saved)).toEqual(saved);
    expect(effectiveSplits(meals, { ...saved, Ceia: 30 })).toEqual(defaultSplits(meals));
    expect(mealTargets(meals, T, saved)[0].kcal).toBe(625);
  });
  it('status da refeição com faixa de ±10%', () => {
    expect(mealStatus(0, false, 648)).toBe('empty');
    expect(mealStatus(500, true, 648)).toBe('below');
    expect(mealStatus(640, true, 648)).toBe('on_target');
    expect(mealStatus(800, true, 648)).toBe('above');
  });
});
