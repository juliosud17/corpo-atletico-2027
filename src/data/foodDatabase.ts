// Base nutricional de referência (valores por 100 g de parte comestível), conferidos nas publicações oficiais:
//  • TACO — Tabela Brasileira de Composição de Alimentos, NEPA/UNICAMP, versão 2 (2ª ed., 2006), Tabela 1.
//  • IBGE — POF 2008-2009: Tabelas de Composição Nutricional dos Alimentos Consumidos no Brasil (2011), Tabela 1.
// "Tr" (traços) e "NA" da tabela foram registrados como 0. Carnes e frango: pesar sem osso.
import type { FoodItem } from '../domain/types';

export const SOURCE_TACO = 'TACO 2ª ed. (NEPA/UNICAMP, 2006)';
export const SOURCE_IBGE = 'IBGE – POF 2008-2009, Tabelas de Composição Nutricional (2011)';

export type FoodGroup = 'protein' | 'carb' | 'dairy' | 'fruit' | 'vegetable' | 'fat' | 'other';
export const GROUP_LABEL: Record<FoodGroup, string> = {
  protein: 'Proteínas', carb: 'Carboidratos', dairy: 'Laticínios', fruit: 'Frutas', vegetable: 'Legumes e verduras', fat: 'Gorduras', other: 'Outros',
};

export interface ReferenceFood {
  id: string;
  name: string;
  group: FoodGroup;
  preparation: 'raw' | 'cooked' | 'other';
  /** Nome exatamente como na tabela de origem. */
  tableName: string;
  source: typeof SOURCE_TACO | typeof SOURCE_IBGE;
  kcal: number; protein: number; carbs: number; fat: number;
  unit?: 'g' | 'ml';
  note?: string;
  /** Alimentos do dia a dia do usuário — aparecem primeiro. */
  everyday?: boolean;
}

const T = SOURCE_TACO, I = SOURCE_IBGE;
const BONE = 'Pese só a parte comestível (sem osso).';

export const REFERENCE_FOODS: ReferenceFood[] = [
  // Proteínas do dia a dia
  { id: 'ref-file-frango-grelhado', name: 'Filé de frango grelhado (peito sem pele)', group: 'protein', preparation: 'cooked', tableName: 'Frango, peito, sem pele, grelhado', source: T, kcal: 159, protein: 32.0, carbs: 0, fat: 2.5, everyday: true },
  { id: 'ref-contra-file-sem-gordura', name: 'Contra-filé grelhado (sem gordura)', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, contra-filé, sem gordura, grelhado', source: T, kcal: 194, protein: 35.9, carbs: 0, fat: 4.5, everyday: true },
  { id: 'ref-contra-file-com-gordura', name: 'Contra-filé grelhado (com gordura)', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, contra-filé, com gordura, grelhado', source: T, kcal: 278, protein: 32.4, carbs: 0, fat: 15.5, everyday: true },
  { id: 'ref-frango-milanesa', name: 'Frango à milanesa (peito empanado)', group: 'protein', preparation: 'cooked', tableName: 'Peito de galinha ou frango, empanado(a)/à milanesa (7800401)', source: I, kcal: 211.84, protein: 31.37, carbs: 3.39, fat: 7.12, everyday: true, note: 'Valor médio de preparação; a quantidade de óleo e de farinha muda o resultado.' },
  { id: 'ref-ovo-cozido', name: 'Ovo cozido', group: 'protein', preparation: 'cooked', tableName: 'Ovo, de galinha, inteiro, cozido/10minutos', source: T, kcal: 146, protein: 13.3, carbs: 0.6, fat: 9.5, everyday: true, note: 'Pese sem casca uma vez e salve como porção “1 ovo”.' },
  { id: 'ref-ovo-frito', name: 'Ovo frito', group: 'protein', preparation: 'cooked', tableName: 'Ovo de galinha, frito(a) (7803301)', source: I, kcal: 222.59, protein: 13.67, carbs: 1.22, fat: 17.65, everyday: true },
  { id: 'ref-ovo-cru', name: 'Ovo cru (mexido ou omelete)', group: 'protein', preparation: 'raw', tableName: 'Ovo, de galinha, inteiro, cru', source: T, kcal: 143, protein: 13.0, carbs: 1.6, fat: 8.9, everyday: true, note: 'Para mexido ou omelete: registre o óleo ou a manteiga à parte.' },
  { id: 'ref-carne-panela-acem', name: 'Carne de panela (acém cozido)', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, acém, sem gordura, cozido', source: T, kcal: 215, protein: 27.3, carbs: 0, fat: 10.9, everyday: true, note: 'Só a carne; o caldo e os legumes da panela entram à parte.' },
  { id: 'ref-coxa-assada-pele', name: 'Coxa de frango assada com pele', group: 'protein', preparation: 'cooked', tableName: 'Frango, coxa, com pele, assada', source: T, kcal: 215, protein: 28.5, carbs: 0.1, fat: 10.4, everyday: true, note: BONE },
  { id: 'ref-sobrecoxa-assada-pele', name: 'Sobrecoxa de frango assada com pele', group: 'protein', preparation: 'cooked', tableName: 'Frango, sobrecoxa, com pele, assada', source: T, kcal: 260, protein: 28.7, carbs: 0, fat: 15.2, everyday: true, note: BONE },
  { id: 'ref-frango-molho-pedacos', name: 'Frango ao molho (pedaços)', group: 'protein', preparation: 'cooked', tableName: 'Frango em pedaços, molho vermelho (7800302)', source: I, kcal: 196.0, protein: 22.10, carbs: 1.08, fat: 10.92, everyday: true, note: BONE },
  { id: 'ref-file-frango-molho', name: 'Filé de frango ao molho', group: 'protein', preparation: 'cooked', tableName: 'Filé de frango, molho vermelho (7800402)', source: I, kcal: 143.2, protein: 24.99, carbs: 1.08, fat: 3.64, everyday: true },
  // Outras proteínas
  { id: 'ref-peito-assado-pele', name: 'Peito de frango assado com pele', group: 'protein', preparation: 'cooked', tableName: 'Frango, peito, com pele, assado', source: T, kcal: 212, protein: 33.4, carbs: 0, fat: 7.6, note: BONE },
  { id: 'ref-patinho-grelhado', name: 'Patinho grelhado (sem gordura)', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, patinho, sem gordura, grelhado', source: T, kcal: 219, protein: 35.9, carbs: 0, fat: 7.3 },
  { id: 'ref-musculo-cozido', name: 'Músculo cozido (sem gordura)', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, músculo, sem gordura, cozido', source: T, kcal: 194, protein: 31.2, carbs: 0, fat: 6.7 },
  { id: 'ref-acem-moido-cozido', name: 'Carne moída (acém) cozida', group: 'protein', preparation: 'cooked', tableName: 'Carne, bovina, acém, moído, cozido', source: T, kcal: 212, protein: 26.7, carbs: 0, fat: 10.9 },
  // Carboidratos
  { id: 'ref-arroz-branco', name: 'Arroz branco cozido', group: 'carb', preparation: 'cooked', tableName: 'Arroz, tipo 1, cozido', source: T, kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2, everyday: true },
  { id: 'ref-arroz-integral', name: 'Arroz integral cozido', group: 'carb', preparation: 'cooked', tableName: 'Arroz, integral, cozido', source: T, kcal: 124, protein: 2.6, carbs: 25.8, fat: 1.0 },
  { id: 'ref-feijao-carioca', name: 'Feijão carioca cozido', group: 'carb', preparation: 'cooked', tableName: 'Feijão, carioca, cozido', source: T, kcal: 76, protein: 4.8, carbs: 13.6, fat: 0.5, everyday: true, note: 'Grãos com caldo, sem tempero gorduroso extra.' },
  { id: 'ref-feijao-preto', name: 'Feijão preto cozido', group: 'carb', preparation: 'cooked', tableName: 'Feijão, preto, cozido', source: T, kcal: 77, protein: 4.5, carbs: 14.0, fat: 0.5 },
  { id: 'ref-pao-forma-integral', name: 'Pão de forma integral', group: 'carb', preparation: 'other', tableName: 'Pão, trigo, forma, integral', source: T, kcal: 253, protein: 9.4, carbs: 49.9, fat: 3.7, everyday: true },
  { id: 'ref-pao-frances', name: 'Pão francês', group: 'carb', preparation: 'other', tableName: 'Pão, trigo, francês', source: T, kcal: 300, protein: 8.0, carbs: 58.6, fat: 3.1 },
  { id: 'ref-batata-cozida', name: 'Batata inglesa cozida', group: 'carb', preparation: 'cooked', tableName: 'Batata, inglesa, cozida', source: T, kcal: 52, protein: 1.2, carbs: 11.9, fat: 0 },
  { id: 'ref-batata-frita', name: 'Batata inglesa frita', group: 'carb', preparation: 'cooked', tableName: 'Batata, inglesa, frita', source: T, kcal: 267, protein: 5.0, carbs: 35.6, fat: 13.1 },
  { id: 'ref-mandioca-cozida', name: 'Mandioca cozida', group: 'carb', preparation: 'cooked', tableName: 'Mandioca, cozida', source: T, kcal: 125, protein: 0.6, carbs: 30.1, fat: 0.3 },
  { id: 'ref-farinha-mandioca', name: 'Farinha de mandioca torrada', group: 'carb', preparation: 'other', tableName: 'Farinha, de mandioca, torrada', source: T, kcal: 365, protein: 1.2, carbs: 89.2, fat: 0.3 },
  { id: 'ref-macarrao-cru', name: 'Macarrão (peso cru)', group: 'carb', preparation: 'raw', tableName: 'Macarrão, trigo, cru', source: T, kcal: 371, protein: 10.0, carbs: 77.9, fat: 1.3, note: 'Valor do macarrão CRU: pese antes de cozinhar.' },
  { id: 'ref-aveia', name: 'Aveia em flocos', group: 'carb', preparation: 'raw', tableName: 'Aveia, flocos, crua', source: T, kcal: 394, protein: 13.9, carbs: 66.6, fat: 8.5 },
  { id: 'ref-acucar', name: 'Açúcar refinado', group: 'other', preparation: 'other', tableName: 'Açúcar, refinado', source: T, kcal: 387, protein: 0, carbs: 99.5, fat: 0 },
  // Laticínios
  { id: 'ref-leite-integral', name: 'Leite integral', group: 'dairy', preparation: 'other', tableName: 'Leite de vaca integral (7900101)', source: I, kcal: 60.03, protein: 3.22, carbs: 4.52, fat: 3.25, unit: 'ml', everyday: true, note: 'Tabela em 100 g, usada aqui como 100 ml (diferença de ~3%).' },
  { id: 'ref-iogurte-natural', name: 'Iogurte natural', group: 'dairy', preparation: 'other', tableName: 'Iogurte, natural', source: T, kcal: 51, protein: 4.1, carbs: 1.9, fat: 3.0 },
  { id: 'ref-queijo-minas', name: 'Queijo minas frescal', group: 'dairy', preparation: 'other', tableName: 'Queijo, minas, frescal', source: T, kcal: 264, protein: 17.4, carbs: 3.2, fat: 20.2 },
  { id: 'ref-requeijao', name: 'Requeijão cremoso', group: 'dairy', preparation: 'other', tableName: 'Requeijão, cremoso', source: T, kcal: 257, protein: 9.6, carbs: 2.4, fat: 23.4 },
  // Frutas
  { id: 'ref-banana-prata', name: 'Banana prata', group: 'fruit', preparation: 'raw', tableName: 'Banana, prata, crua', source: T, kcal: 98, protein: 1.3, carbs: 26.0, fat: 0.1, everyday: true },
  { id: 'ref-banana-nanica', name: 'Banana nanica', group: 'fruit', preparation: 'raw', tableName: 'Banana, nanica, crua', source: T, kcal: 92, protein: 1.4, carbs: 23.8, fat: 0.1 },
  { id: 'ref-maca-fuji', name: 'Maçã Fuji', group: 'fruit', preparation: 'raw', tableName: 'Maçã, Fuji, crua', source: T, kcal: 56, protein: 0.3, carbs: 15.2, fat: 0 },
  { id: 'ref-mamao-formosa', name: 'Mamão formosa', group: 'fruit', preparation: 'raw', tableName: 'Mamão, Formosa, cru', source: T, kcal: 45, protein: 0.8, carbs: 11.6, fat: 0.1 },
  { id: 'ref-laranja-pera', name: 'Laranja pera', group: 'fruit', preparation: 'raw', tableName: 'Laranja, pêra, crua', source: T, kcal: 37, protein: 1.0, carbs: 8.9, fat: 0.1 },
  // Legumes e verduras
  { id: 'ref-alface', name: 'Alface crespa', group: 'vegetable', preparation: 'raw', tableName: 'Alface, crespa, crua', source: T, kcal: 11, protein: 1.3, carbs: 1.7, fat: 0.2, everyday: true },
  { id: 'ref-tomate', name: 'Tomate', group: 'vegetable', preparation: 'raw', tableName: 'Tomate, com semente, cru', source: T, kcal: 15, protein: 1.1, carbs: 3.1, fat: 0.2, everyday: true },
  { id: 'ref-brocolis', name: 'Brócolis cozido', group: 'vegetable', preparation: 'cooked', tableName: 'Brócolis, cozido', source: T, kcal: 25, protein: 2.1, carbs: 4.4, fat: 0.5 },
  { id: 'ref-cenoura', name: 'Cenoura cozida', group: 'vegetable', preparation: 'cooked', tableName: 'Cenoura, cozida', source: T, kcal: 30, protein: 0.8, carbs: 6.7, fat: 0.2 },
  { id: 'ref-abobrinha', name: 'Abobrinha italiana cozida', group: 'vegetable', preparation: 'cooked', tableName: 'Abobrinha, italiana, cozida', source: T, kcal: 15, protein: 1.1, carbs: 3.0, fat: 0.2 },
  // Ingredientes crus para receitas (TACO 2ª ed.)
  { id: 'ref-frango-peito-cru', name: 'Peito de frango cru (receitas)', group: 'protein', preparation: 'raw', tableName: 'Frango, peito, sem pele, cru', source: T, kcal: 119, protein: 21.5, carbs: 0, fat: 3.0 },
  { id: 'ref-frango-coxa-crua', name: 'Coxa de frango crua com pele (receitas)', group: 'protein', preparation: 'raw', tableName: 'Frango, coxa, com pele, crua', source: T, kcal: 161, protein: 17.1, carbs: 0, fat: 9.8, note: BONE },
  { id: 'ref-frango-sobrecoxa-crua', name: 'Sobrecoxa de frango crua com pele (receitas)', group: 'protein', preparation: 'raw', tableName: 'Frango, sobrecoxa, com pele, crua', source: T, kcal: 255, protein: 15.5, carbs: 0, fat: 20.9, note: BONE },
  { id: 'ref-contra-file-cru', name: 'Contra-filé cru sem gordura (receitas)', group: 'protein', preparation: 'raw', tableName: 'Carne, bovina, contra-filé, sem gordura, cru', source: T, kcal: 157, protein: 24.0, carbs: 0, fat: 6.0 },
  { id: 'ref-contra-file-cru-gordura', name: 'Contra-filé cru com gordura (receitas)', group: 'protein', preparation: 'raw', tableName: 'Carne, bovina, contra-filé, com gordura, cru', source: T, kcal: 206, protein: 21.2, carbs: 0, fat: 12.8 },
  { id: 'ref-acem-cru', name: 'Acém cru (receitas)', group: 'protein', preparation: 'raw', tableName: 'Carne, bovina, acém, sem gordura, cru', source: T, kcal: 144, protein: 20.8, carbs: 0, fat: 6.1 },
  { id: 'ref-acem-moido-cru', name: 'Carne moída (acém) crua (receitas)', group: 'protein', preparation: 'raw', tableName: 'Carne, bovina, acém, moída, cru', source: T, kcal: 137, protein: 19.4, carbs: 0, fat: 5.9 },
  { id: 'ref-patinho-cru', name: 'Patinho cru (receitas)', group: 'protein', preparation: 'raw', tableName: 'Carne, bovina, patinho, sem gordura, cru', source: T, kcal: 133, protein: 21.7, carbs: 0, fat: 4.5 },
  { id: 'ref-arroz-cru', name: 'Arroz branco cru (receitas)', group: 'carb', preparation: 'raw', tableName: 'Arroz, tipo 1, cru', source: T, kcal: 358, protein: 7.2, carbs: 78.8, fat: 0.3 },
  { id: 'ref-feijao-carioca-cru', name: 'Feijão carioca cru (receitas)', group: 'carb', preparation: 'raw', tableName: 'Feijão, carioca, cru', source: T, kcal: 329, protein: 20.0, carbs: 61.2, fat: 1.3 },
  { id: 'ref-feijao-preto-cru', name: 'Feijão preto cru (receitas)', group: 'carb', preparation: 'raw', tableName: 'Feijão, preto, cru', source: T, kcal: 324, protein: 21.3, carbs: 58.8, fat: 1.2 },
  { id: 'ref-lentilha-crua', name: 'Lentilha crua (receitas)', group: 'carb', preparation: 'raw', tableName: 'Lentilha, crua', source: T, kcal: 339, protein: 23.2, carbs: 62.0, fat: 0.8 },
  { id: 'ref-grao-de-bico-cru', name: 'Grão-de-bico cru (receitas)', group: 'carb', preparation: 'raw', tableName: 'Grão-de-bico, cru', source: T, kcal: 355, protein: 21.2, carbs: 57.9, fat: 5.4 },
  { id: 'ref-farinha-trigo', name: 'Farinha de trigo', group: 'carb', preparation: 'raw', tableName: 'Farinha, de trigo', source: T, kcal: 360, protein: 9.8, carbs: 75.1, fat: 1.4 },
  { id: 'ref-farinha-rosca', name: 'Farinha de rosca', group: 'carb', preparation: 'other', tableName: 'Farinha, de rosca', source: T, kcal: 371, protein: 11.4, carbs: 75.8, fat: 1.5 },
  { id: 'ref-fuba', name: 'Fubá de milho', group: 'carb', preparation: 'raw', tableName: 'Milho, fubá, cru', source: T, kcal: 353, protein: 7.2, carbs: 78.9, fat: 1.9 },
  { id: 'ref-amido-milho', name: 'Amido de milho', group: 'carb', preparation: 'raw', tableName: 'Milho, amido, cru', source: T, kcal: 361, protein: 0.6, carbs: 87.1, fat: 0 },
  { id: 'ref-batata-crua', name: 'Batata inglesa crua (receitas)', group: 'carb', preparation: 'raw', tableName: 'Batata, inglesa, crua', source: T, kcal: 64, protein: 1.8, carbs: 14.7, fat: 0 },
  { id: 'ref-mandioca-crua', name: 'Mandioca crua (receitas)', group: 'carb', preparation: 'raw', tableName: 'Mandioca, crua', source: T, kcal: 151, protein: 1.1, carbs: 36.2, fat: 0.3 },
  { id: 'ref-milho-verde', name: 'Milho verde em conserva (drenado)', group: 'carb', preparation: 'other', tableName: 'Milho, verde, enlatado, drenado', source: T, kcal: 98, protein: 3.2, carbs: 17.1, fat: 2.4 },
  { id: 'ref-ervilha', name: 'Ervilha em conserva (drenada)', group: 'vegetable', preparation: 'other', tableName: 'Ervilha, enlatada, drenada', source: T, kcal: 74, protein: 4.6, carbs: 13.4, fat: 0.4 },
  { id: 'ref-cebola', name: 'Cebola crua', group: 'vegetable', preparation: 'raw', tableName: 'Cebola, crua', source: T, kcal: 39, protein: 1.7, carbs: 8.9, fat: 0.1 },
  { id: 'ref-alho', name: 'Alho cru', group: 'vegetable', preparation: 'raw', tableName: 'Alho, cru', source: T, kcal: 113, protein: 7.0, carbs: 23.9, fat: 0.2 },
  { id: 'ref-cenoura-crua', name: 'Cenoura crua', group: 'vegetable', preparation: 'raw', tableName: 'Cenoura, crua', source: T, kcal: 34, protein: 1.3, carbs: 7.7, fat: 0.2 },
  { id: 'ref-pimentao', name: 'Pimentão verde cru', group: 'vegetable', preparation: 'raw', tableName: 'Pimentão, verde, cru', source: T, kcal: 21, protein: 1.1, carbs: 4.9, fat: 0.2 },
  { id: 'ref-abobora', name: 'Abóbora cabotiá crua', group: 'vegetable', preparation: 'raw', tableName: 'Abóbora, cabotian, crua', source: T, kcal: 39, protein: 1.7, carbs: 8.4, fat: 0.5 },
  { id: 'ref-extrato-tomate', name: 'Extrato de tomate', group: 'vegetable', preparation: 'other', tableName: 'Tomate, extrato', source: T, kcal: 61, protein: 2.4, carbs: 15.0, fat: 0.2 },
  { id: 'ref-parmesao', name: 'Queijo parmesão', group: 'dairy', preparation: 'other', tableName: 'Queijo, parmesão', source: T, kcal: 453, protein: 35.6, carbs: 1.7, fat: 33.5 },
  { id: 'ref-maionese', name: 'Maionese tradicional', group: 'fat', preparation: 'other', tableName: 'Maionese, industrializada, tradicional com ovos', source: T, kcal: 302, protein: 0.6, carbs: 7.9, fat: 30.5 },
  // Gorduras
  { id: 'ref-azeite', name: 'Azeite de oliva', group: 'fat', preparation: 'other', tableName: 'Azeite, de oliva, extra virgem', source: T, kcal: 884, protein: 0, carbs: 0, fat: 100 },
  { id: 'ref-oleo-soja', name: 'Óleo de soja', group: 'fat', preparation: 'other', tableName: 'Óleo, de soja', source: T, kcal: 884, protein: 0, carbs: 0, fat: 100, note: 'Use para o óleo de fritura/refogado que você somar à parte.' },
  { id: 'ref-manteiga', name: 'Manteiga com sal', group: 'fat', preparation: 'other', tableName: 'Manteiga, com sal', source: T, kcal: 726, protein: 0.4, carbs: 0.1, fat: 82.4 },
];

export const REFERENCE_IDS = new Set(REFERENCE_FOODS.map((f) => f.id));

export function referenceToFoodItem(r: ReferenceFood, now: string, existing?: FoodItem): FoodItem {
  return {
    id: r.id,
    name: r.name,
    preparation: r.preparation,
    referenceAmount: 100,
    referenceUnit: r.unit ?? 'g',
    kcalPerReference: r.kcal,
    proteinGPerReference: r.protein,
    carbsGPerReference: r.carbs,
    fatGPerReference: r.fat,
    source: `${r.source} — “${r.tableName}”`,
    builtin: true,
    group: r.group,
    note: r.note,
    // Preferências do usuário são mantidas ao atualizar a base.
    favorite: existing ? existing.favorite : r.everyday,
    portions: existing?.portions,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
