// Receitas: leitura de texto/página, ligação com a base de alimentos, totais e porções (puro).
import { nutrientsForAmount } from './calculations';
import type { FoodItem, Recipe, RecipeIngredient } from './types';

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------------------------
// Quantidades e unidades
// ---------------------------------------------------------------------------------------------
export type ParsedUnit = 'g' | 'kg' | 'ml' | 'l' | 'xicara' | 'colher_sopa' | 'colher_sobremesa' | 'colher_cha' | 'copo' | 'unidade' | 'dente' | 'fatia' | 'lata' | 'pitada' | 'a_gosto' | null;

/** Volumes padronizados (medidas culinárias). */
export const VOLUME_ML: Partial<Record<NonNullable<ParsedUnit>, number>> = {
  ml: 1, l: 1000, xicara: 240, copo: 200, colher_sopa: 15, colher_sobremesa: 10, colher_cha: 5,
};

/** Densidades conhecidas (g/ml) usadas só para gorduras líquidas. */
const DENSITY: Record<string, number> = { 'ref-azeite': 0.92, 'ref-oleo-soja': 0.92 };

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

export interface ParsedLine { text: string; quantity?: number; unit: ParsedUnit; name: string }

export function parseQuantity(s: string): { q?: number; rest: string } {
  let t = s.trim();
  for (const [k, v] of Object.entries(FRACTIONS)) t = t.replace(new RegExp(`(\\d)\\s*${k}`), (_, d) => String(Number(d) + v)).replace(k, String(v));
  // "1 e 1/2", "1 1/2", "1/2", "1,5", "1.5", "2-3" (usa o primeiro)
  let m = /^(\d+)\s+(?:e\s+)?(\d+)\/(\d+)\b/.exec(t);
  if (m) return { q: Number(m[1]) + Number(m[2]) / Number(m[3]), rest: t.slice(m[0].length) };
  m = /^(\d+)\/(\d+)\b/.exec(t);
  if (m) return { q: Number(m[1]) / Number(m[2]), rest: t.slice(m[0].length) };
  m = /^(\d+(?:[.,]\d+)?)(?:\s*(?:a|-|–)\s*\d+(?:[.,]\d+)?)?/.exec(t);
  if (m) return { q: Number(m[1].replace(',', '.')), rest: t.slice(m[0].length) };
  m = /^(uma?|meia|meio|duas|dois|tr[eê]s)\b/i.exec(t);
  if (m) {
    const w = norm(m[1]);
    const q = w === 'meia' || w === 'meio' ? 0.5 : w === 'duas' || w === 'dois' ? 2 : w.startsWith('tr') ? 3 : 1;
    return { q, rest: t.slice(m[0].length) };
  }
  return { rest: t };
}

const UNIT_PATTERNS: [RegExp, ParsedUnit][] = [
  [/^(kg|quilos?|kilos?)\b/, 'kg'],
  [/^(g|gr|grs|gramas?)\b/, 'g'],
  [/^(ml|mililitros?)\b/, 'ml'],
  [/^(l|litros?)\b/, 'l'],
  [/^x[ií]caras?(\s*\(?\s*(de\s+)?ch[áa]\s*\)?)?/, 'xicara'],
  [/^copos?(\s*\(?\s*(americano|requeij[aã]o)\s*\)?)?/, 'copo'],
  [/^colher(es)?\s*\(?\s*(de\s+)?sopa\s*\)?/, 'colher_sopa'],
  [/^colher(es)?\s*\(?\s*(de\s+)?sobremesa\s*\)?/, 'colher_sobremesa'],
  [/^colher(es)?\s*\(?\s*(de\s+)?(ch[áa]|caf[ée])\s*\)?/, 'colher_cha'],
  [/^colher(es)?\b/, 'colher_sopa'],
  [/^dentes?\b/, 'dente'],
  [/^fatias?\b/, 'fatia'],
  [/^latas?\b/, 'lata'],
  [/^pitadas?\b/, 'pitada'],
  [/^(unidades?|un\.?|und\.?)\b/, 'unidade'],
];

export function parseIngredientLine(raw: string): ParsedLine {
  const text = raw.replace(/^[\s•\-–*·▪◦●○]+/, '').replace(/\s+/g, ' ').trim();
  const { q, rest } = parseQuantity(text);
  let r = rest.trim();
  let unit: ParsedUnit = null;
  const low = r.toLowerCase();
  for (const [re, u] of UNIT_PATTERNS) {
    const m = re.exec(low);
    if (m) { unit = u; r = r.slice(m[0].length).trim(); break; }
  }
  if (/a gosto|q\.?b\.?|quanto baste/i.test(text)) unit = unit ?? 'a_gosto';
  const name = r.replace(/^(de|do|da|dos|das)\s+/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[,;.]\s*$/, '').trim();
  if (q !== undefined && unit === null) unit = 'unidade';
  return { text, quantity: q, unit, name: name || text };
}

// ---------------------------------------------------------------------------------------------
// Texto colado / página
// ---------------------------------------------------------------------------------------------
export interface ParsedRecipe { name?: string; servings?: number; ingredients: string[]; sourceUrl?: string }

const SECTION_END = /^(modo de preparo|preparo|como fazer|modo de fazer|instru[cç][oõ]es|passo a passo|informa[cç][oõ]es nutricionais)\b/i;
const SECTION_START = /^(ingredientes?|lista de ingredientes)\b/i;

function servingsFrom(s: string): number | undefined {
  const m = /(?:rende|rendimento|serve|por[cç][oõ]es)\D{0,15}(\d+(?:[.,]\d+)?)/i.exec(s) ?? /(\d+(?:[.,]\d+)?)\s*(?:por[cç][oõ]es|pessoas|unidades|fatias)/i.exec(s);
  return m ? Number(m[1].replace(',', '.')) : undefined;
}

const looksLikeIngredient = (l: string) => /^[\s•\-–*·▪◦●○]*(\d|½|¼|¾|uma?\b|meia\b|meio\b|duas\b|dois\b|tr[eê]s\b)/i.test(l) || /\b(a gosto|q\.?b\.?)\b/i.test(l)
  || /^[\s•\-–*·]/.test(l);

/** Lê uma receita colada (título, rendimento, lista de ingredientes; ignora o modo de preparo). */
export function parseRecipeText(input: string): ParsedRecipe {
  const lines = input.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedRecipe = { ingredients: [] };
  const url = /https?:\/\/\S+/.exec(input);
  if (url) out.sourceUrl = url[0];
  let inIngredients = false, sawSection = false;
  for (const line of lines) {
    if (/^https?:\/\//.test(line)) continue;
    if (SECTION_END.test(line)) { if (inIngredients || out.ingredients.length) break; continue; }
    if (SECTION_START.test(line)) { inIngredients = true; sawSection = true; continue; }
    const sv = servingsFrom(line);
    if (sv && !looksLikeIngredient(line)) { out.servings ??= sv; continue; }
    if (!out.name && !looksLikeIngredient(line) && !inIngredients) { out.name = line.replace(/^receita (de|do|da)\s+/i, ''); continue; }
    if (inIngredients || (!sawSection && looksLikeIngredient(line))) {
      if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{3,}:?$/.test(line) || /:\s*$/.test(line)) continue; // subtítulos ("PARA O MOLHO:")
      out.ingredients.push(line.replace(/^[\s•\-–*·▪◦●○]+/, ''));
    }
  }
  return out;
}

/** Extrai receita de HTML com dados estruturados schema.org (JSON-LD), quando o site permite a leitura. */
export function parseRecipeHtml(html: string, url?: string): ParsedRecipe | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const find = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) { for (const n of node) { const r = find(n); if (r) return r; } return null; }
    const o = node as Record<string, unknown>;
    const t = o['@type'];
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return o;
    return find(o['@graph']);
  };
  for (const b of blocks) {
    try {
      const r = find(JSON.parse(b.trim()));
      if (!r) continue;
      const ing = (r.recipeIngredient ?? r.ingredients) as unknown;
      const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield.join(' ') : String(r.recipeYield ?? '');
      return {
        name: typeof r.name === 'string' ? r.name.trim() : undefined,
        servings: servingsFrom(yieldRaw) ?? (Number.parseFloat(yieldRaw) || undefined),
        ingredients: Array.isArray(ing) ? ing.map((x) => String(x).replace(/<[^>]+>/g, '').trim()).filter(Boolean) : [],
        sourceUrl: url,
      };
    } catch { /* bloco inválido: ignora */ }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Ligação com a base de alimentos
// ---------------------------------------------------------------------------------------------
/** Palavras-chave → alimento da base (ingredientes de receita costumam vir crus). Ordem importa: mais específico primeiro. */
const KEYWORDS: [RegExp, string][] = [
  [/sobrecoxa/, 'ref-frango-sobrecoxa-crua'],
  [/coxa/, 'ref-frango-coxa-crua'],
  [/(peito|file|filezinho|sassami).*(frango)|frango.*(peito|file)|frango em cubos|frango desfiado/, 'ref-frango-peito-cru'],
  [/frango/, 'ref-frango-peito-cru'],
  [/contra.?file/, 'ref-contra-file-cru-gordura'],
  [/carne moida|moida/, 'ref-acem-moido-cru'],
  [/acem|carne de panela|carne para panela/, 'ref-acem-cru'],
  [/patinho/, 'ref-patinho-cru'],
  [/clara/, ''],
  [/ovos?\b/, 'ref-ovo-cru'],
  [/arroz integral/, 'ref-arroz-integral'],
  [/arroz/, 'ref-arroz-cru'],
  [/feijao preto/, 'ref-feijao-preto-cru'],
  [/feijao/, 'ref-feijao-carioca-cru'],
  [/lentilha/, 'ref-lentilha-crua'],
  [/grao.de.bico/, 'ref-grao-de-bico-cru'],
  [/farinha de rosca|farinha panko|panko/, 'ref-farinha-rosca'],
  [/farinha de mandioca/, 'ref-farinha-mandioca'],
  [/farinha de trigo|farinha\b/, 'ref-farinha-trigo'],
  [/fuba/, 'ref-fuba'],
  [/amido de milho|maisena|maizena/, 'ref-amido-milho'],
  [/milho/, 'ref-milho-verde'],
  [/ervilha/, 'ref-ervilha'],
  [/aveia/, 'ref-aveia'],
  [/batata/, 'ref-batata-crua'],
  [/mandioca|aipim|macaxeira/, 'ref-mandioca-crua'],
  [/abobora/, 'ref-abobora'],
  [/extrato de tomate|massa de tomate/, 'ref-extrato-tomate'],
  [/tomate/, 'ref-tomate'],
  [/cebola/, 'ref-cebola'],
  [/alho/, 'ref-alho'],
  [/cenoura/, 'ref-cenoura-crua'],
  [/pimentao/, 'ref-pimentao'],
  [/brocolis/, 'ref-brocolis'],
  [/abobrinha/, 'ref-abobrinha'],
  [/alface/, 'ref-alface'],
  [/parmesao/, 'ref-parmesao'],
  [/queijo minas|minas frescal/, 'ref-queijo-minas'],
  [/requeijao/, 'ref-requeijao'],
  [/iogurte/, 'ref-iogurte-natural'],
  [/leite condensado|leite de coco|creme de leite/, ''],
  [/leite/, 'ref-leite-integral'],
  [/azeite/, 'ref-azeite'],
  [/oleo/, 'ref-oleo-soja'],
  [/manteiga/, 'ref-manteiga'],
  [/maionese/, 'ref-maionese'],
  [/acucar/, 'ref-acucar'],
  [/banana/, 'ref-banana-prata'],
  [/maca\b/, 'ref-maca-fuji'],
  [/pao de forma/, 'ref-pao-forma-integral'],
  [/pao/, 'ref-pao-frances'],
  [/macarrao|espaguete|penne|parafuso|talharim/, 'ref-macarrao-cru'],
];

/** Sem calorias relevantes: tratado como ignorado (o usuário pode desfazer). */
const NEGLIGIBLE = /^(sal|sal a gosto|pimenta.*|agua.*|cheiro.?verde|salsinha|cebolinha|coentro|oregano|louro|folhas? de louro|colorau|paprica|cominho|caldo de .* em po|tempero.*|lim[aã]o.*suco|suco de lim[aã]o)\b/;

export function matchFood(name: string, foods: Pick<FoodItem, 'id' | 'name'>[]): string | undefined {
  const n = norm(name);
  for (const [re, id] of KEYWORDS) {
    if (re.test(n)) return id && foods.some((f) => f.id === id) ? id : undefined;
  }
  // Nome igual a um alimento do catálogo do usuário
  const exact = foods.find((f) => norm(f.name) === n);
  return exact?.id;
}

export function isNegligible(name: string, unit: ParsedUnit): boolean {
  return unit === 'a_gosto' || unit === 'pitada' || NEGLIGIBLE.test(norm(name));
}

/**
 * Converte a quantidade da linha para a unidade de referência do alimento.
 * Só converte quando a conversão é exata (massa, volume para itens em ml, densidade conhecida de óleos,
 * porção salva pelo usuário para “unidade”). Caso contrário, retorna undefined (o usuário informa).
 */
export function convertAmount(p: Pick<ParsedLine, 'quantity' | 'unit' | 'name'>, food: Pick<FoodItem, 'id' | 'referenceUnit' | 'portions'>): number | undefined {
  const q = p.quantity;
  if (q === undefined || q <= 0 || !p.unit) return undefined;
  if (p.unit === 'g') return food.referenceUnit === 'g' ? q : undefined;
  if (p.unit === 'kg') return food.referenceUnit === 'g' ? q * 1000 : undefined;
  const ml = VOLUME_ML[p.unit];
  if (ml !== undefined) {
    const vol = q * ml;
    if (food.referenceUnit === 'ml') return vol;
    const d = DENSITY[food.id];
    return food.referenceUnit === 'g' && d ? vol * d : undefined;
  }
  if (p.unit === 'unidade' || p.unit === 'dente' || p.unit === 'fatia') {
    if (food.referenceUnit === 'unit') return q;
    const n = norm(p.name);
    const portion = food.portions?.find((x) => /^1\b/.test(x.label) && (p.unit === 'fatia' ? /fatia/.test(norm(x.label)) : p.unit === 'dente' ? /dente/.test(norm(x.label)) : !/fatia|dente|colher|xicara|concha/.test(norm(x.label)) || n.includes(norm(x.label).replace(/^1\s*/, ''))));
    return portion ? q * portion.amount : undefined;
  }
  return undefined;
}

export function buildIngredients(lines: string[], foods: FoodItem[], makeId: () => string): RecipeIngredient[] {
  return lines.map((line) => {
    const p = parseIngredientLine(line);
    if (isNegligible(p.name, p.unit)) return { id: makeId(), text: p.text, ignored: true };
    const foodId = matchFood(p.name, foods);
    const food = foods.find((f) => f.id === foodId);
    return { id: makeId(), text: p.text, foodId, amount: food ? convertAmount(p, food) : undefined };
  });
}

// ---------------------------------------------------------------------------------------------
// Totais e porções
// ---------------------------------------------------------------------------------------------
export interface RecipeTotals {
  kcal: number; proteinG: number; carbsG: number; fatG: number;
  /** Ingredientes que entram na conta. */
  counted: number;
  /** Ingredientes sem alimento ligado ou sem quantidade — a conta fica parcial. */
  pending: number;
  ignored: number;
  /** Peso cru somado (g) dos ingredientes em gramas. */
  rawWeightG: number;
}

export function recipeTotals(r: Pick<Recipe, 'ingredients'>, foods: FoodItem[]): RecipeTotals {
  const t: RecipeTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, counted: 0, pending: 0, ignored: 0, rawWeightG: 0 };
  for (const i of r.ingredients) {
    if (i.ignored) { t.ignored++; continue; }
    const f = i.foodId ? foods.find((x) => x.id === i.foodId) : undefined;
    if (!f || i.amount === undefined || i.amount <= 0) { t.pending++; continue; }
    const n = nutrientsForAmount(f, i.amount, f.referenceUnit);
    if (!n || n.kcal === undefined) { t.pending++; continue; }
    t.kcal += n.kcal; t.proteinG += n.proteinG ?? 0; t.carbsG += n.carbsG ?? 0; t.fatG += n.fatG ?? 0;
    t.counted++;
    if (f.referenceUnit === 'g') t.rawWeightG += i.amount;
  }
  return t;
}

export interface PerServing { kcal: number; proteinG: number; carbsG: number; fatG: number; grams?: number }

export function perServing(t: RecipeTotals, r: Pick<Recipe, 'servings' | 'cookedWeightG'>): PerServing {
  const s = r.servings > 0 ? r.servings : 1;
  return { kcal: t.kcal / s, proteinG: t.proteinG / s, carbsG: t.carbsG / s, fatG: t.fatG / s, grams: r.cookedWeightG ? r.cookedWeightG / s : undefined };
}

/** Nutrientes de uma quantidade consumida: em porções ou em gramas do preparo pronto. */
export function consumedFromRecipe(t: RecipeTotals, r: Pick<Recipe, 'servings' | 'cookedWeightG'>, amount: number, mode: 'portions' | 'grams') {
  const fraction = mode === 'portions' ? amount / (r.servings || 1) : r.cookedWeightG ? amount / r.cookedWeightG : NaN;
  if (!Number.isFinite(fraction) || fraction <= 0) return null;
  return { kcal: t.kcal * fraction, proteinG: t.proteinG * fraction, carbsG: t.carbsG * fraction, fatG: t.fatG * fraction };
}

export interface PortionSuggestion { portions: number; grams?: number; kcal: number; proteinG: number }

/** Quantas porções (múltiplos de ¼) chegam mais perto da meta de kcal informada. */
export function suggestPortions(ps: PerServing, targetKcal: number): PortionSuggestion | null {
  if (!(ps.kcal > 0) || !(targetKcal > 0)) return null;
  const portions = Math.max(0.25, Math.round((targetKcal / ps.kcal) * 4) / 4);
  return { portions, grams: ps.grams ? ps.grams * portions : undefined, kcal: ps.kcal * portions, proteinG: ps.proteinG * portions };
}

export function formatPortions(p: number): string {
  return `${formatQty(p)} ${p > 1 ? 'porções' : 'porção'}`;
}

// ------------------------------------------------------------------------------------------------
// Valor nutricional efetivo e escala de quantidades (receitas prontas)
// ------------------------------------------------------------------------------------------------
export type NutritionBasis = 'taco' | 'declared' | 'partial';
export interface RecipeNutrition {
  /** Valor por porção usado no app (registro, sugestões). */
  perServing: PerServing & { fiberG?: number };
  basis: NutritionBasis;
  totals: RecipeTotals;
  /** Conta pelos ingredientes (TACO/IBGE), mesmo que parcial. */
  taco: PerServing;
}

/**
 * Regra: a conta pelos ingredientes (TACO/IBGE) vale quando está completa.
 * Se faltar algum ingrediente e a receita trouxer valores informados pela fonte, usa os da fonte.
 * Sem isso, mostra a conta parcial (sinalizada).
 */
export function recipeNutrition(r: Pick<Recipe, 'ingredients' | 'servings' | 'cookedWeightG' | 'declared'>, foods: FoodItem[]): RecipeNutrition {
  const totals = recipeTotals(r, foods);
  const taco = perServing(totals, r);
  if (totals.pending === 0 && totals.counted > 0) return { perServing: taco, basis: 'taco', totals, taco };
  if (r.declared) {
    const d = r.declared;
    return { perServing: { kcal: d.kcal, proteinG: d.proteinG, carbsG: d.carbsG, fatG: d.fatG, fiberG: d.fiberG, grams: taco.grams }, basis: 'declared', totals, taco };
  }
  return { perServing: taco, basis: 'partial', totals, taco };
}

/** Quanto foi consumido em `amount` porções (ou gramas do preparo pronto). */
export function eatenFromRecipe(n: RecipeNutrition, amount: number, mode: 'portions' | 'grams') {
  const ps = n.perServing;
  const factor = mode === 'portions' ? amount : ps.grams ? amount / ps.grams : NaN;
  if (!Number.isFinite(factor) || factor <= 0) return null;
  return { kcal: ps.kcal * factor, proteinG: ps.proteinG * factor, carbsG: ps.carbsG * factor, fatG: ps.fatG * factor };
}

/** 0,5 → "½", 1,25 → "1 ¼", 2,4 → "2,4". */
export function formatQty(q: number): string {
  const whole = Math.floor(q + 1e-9), frac = q - whole;
  const near = (x: number) => Math.abs(frac - x) < 0.04;
  const f = near(0.25) ? '¼' : near(0.5) ? '½' : near(0.75) ? '¾' : near(1 / 3) ? '⅓' : near(2 / 3) ? '⅔' : '';
  if (f) return whole ? `${whole} ${f}` : f;
  if (frac < 0.04 || frac > 0.96) return String(Math.round(q));
  return String(Math.round(q * 10) / 10).replace('.', ',');
}

/** Multiplica a quantidade no início da medida: ("½ xícara", 2) → "1 xícara". Sem número, mantém o texto. */
export function scaleMeasure(measure: string, factor: number): string {
  if (Math.abs(factor - 1) < 1e-9) return measure;
  const { q, rest } = parseQuantity(measure);
  if (q === undefined) return measure;
  return `${formatQty(q * factor)}${rest.startsWith(' ') || !rest ? '' : ' '}${rest}`.trim();
}

/** Nome e medida de um ingrediente para exibição, já escalados. */
export function ingredientDisplay(ing: RecipeIngredient, factor = 1): { name: string; measure?: string } {
  const gv = ing.grams !== undefined ? ing.grams * factor : undefined;
  const g = gv === undefined ? undefined : `${gv >= 10 ? Math.round(gv) : String(Math.round(gv * 10) / 10).replace('.', ',')} g`;
  if (ing.name) {
    const m = ing.measure ? scaleMeasure(ing.measure, factor) : undefined;
    return { name: ing.name, measure: m && g ? `${m} (${g})` : m ?? g };
  }
  return { name: scaleMeasure(ing.text, factor) };
}
