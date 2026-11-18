import { describe, expect, it } from 'vitest';
import {
  averageLabel, bmi, bmrMifflinStJeor, completeKcal, dayTotals, expectedWeightOn, kcalFromMacros, kcalSummaryText,
  latestWeight, nutrientsForAmount, nutritionAdherence, parseDecimal, planLinePoints, progressToGoal, reviewTrend,
  targetsForDate, weeklyAverages, weeklyChange,
} from '../domain/calculations';
import { addDays, dateInTimeZone, formatBR, isISODate, parseBR, weekStartMonday, weekday } from '../domain/dates';
import { INITIAL_TARGETS } from '../data/seed';
import type { GoalMilestone, NutritionTargets } from '../domain/types';

// Plano de exemplo (os dados pessoais reais ficam fora do repositório público — ver private/).
const EXAMPLE_MILESTONES = [
  { date: '2026-11-17', targetWeightKg: 100.0 }, { date: '2026-12-17', targetWeightKg: 98.0 },
  { date: '2027-01-17', targetWeightKg: 96.0 }, { date: '2027-09-17', targetWeightKg: 82.0 },
];
const ms: GoalMilestone[] = EXAMPLE_MILESTONES.map((m, i) => ({ id: String(i), ...m, updatedAt: '' }));

describe('Fórmulas (valores de exemplo)', () => {
  it('IMC = peso / altura²', () => {
    expect(bmi(100, 180)).toBeCloseTo(30.86, 2);
    expect(bmi(90, 175)!.toFixed(1)).toBe('29.4');
    expect(bmi(0, 175)).toBeNull();
  });

  it('TMB Mifflin-St Jeor', () => {
    expect(bmrMifflinStJeor({ weightKg: 100, heightCm: 180, age: 30, sex: 'male' })).toBe(1980);
    expect(bmrMifflinStJeor({ weightKg: 100, heightCm: 180, age: 30, sex: 'female' })).toBe(1814);
    expect(bmrMifflinStJeor({ weightKg: 100, heightCm: 180, age: 33, sex: 'unspecified' })).toBeNull();
    expect(bmrMifflinStJeor({ weightKg: 100, heightCm: 180, sex: 'male' })).toBeNull();
  });

  it('kcal de macros = P×4 + C×4 + G×9', () => {
    expect(kcalFromMacros(180, 265, 80)).toBe(2500);
    expect(Math.abs(kcalFromMacros(INITIAL_TARGETS.proteinG, INITIAL_TARGETS.carbsG, INITIAL_TARGETS.fatG) - INITIAL_TARGETS.caloriesKcal)).toBeLessThan(10);
  });

  it('progresso: 100 → 82 com 99 kg = 1/18 ≈ 5,6%', () => {
    const p = progressToGoal(100, 99, 82);
    expect(p.percentRaw).toBeCloseTo(100 / 18, 5);
    expect(p.percentClamped.toFixed(1)).toBe('5.6');
    expect(p.changeKg).toBeCloseTo(1, 10);
  });

  it('progresso: acima do peso inicial mostra 0% e variação real; acima da meta limita 100%', () => {
    const up = progressToGoal(100, 101.2, 82);
    expect(up.percentClamped).toBe(0);
    expect(up.aboveStart).toBe(true);
    expect(up.changeKg).toBeCloseTo(-1.2, 10);
    expect(progressToGoal(100, 80, 82).percentClamped).toBe(100);
  });

  it('progresso: meta igual ao início não divide por zero', () => {
    const p = progressToGoal(100, 99, 100);
    expect(p.percentRaw).toBeNull();
    expect(p.percentClamped).toBe(0);
    expect(p.direction).toBe('none');
  });

  it('progresso: meta de ganho (invertida) é tratada', () => {
    const p = progressToGoal(70, 72, 80);
    expect(p.direction).toBe('gain');
    expect(p.percentRaw).toBeCloseTo(20, 5);
  });
});

describe('Metas interpoladas', () => {
  it('nos marcos retorna o valor exato', () => {
    expect(expectedWeightOn(ms, '2026-11-17')).toEqual({ valueKg: 100, status: 'in_plan' });
    expect(expectedWeightOn(ms, '2027-09-17').valueKg).toBe(82);
  });
  it('interpola linearmente por datas reais', () => {
    // 17/11 → 17/12 = 30 dias, 100 → 98. Dia 2/12 = 15 dias → 99.
    expect(expectedWeightOn(ms, '2026-12-02').valueKg).toBeCloseTo(99, 10);
  });
  it('fora do intervalo é explícito', () => {
    expect(expectedWeightOn(ms, '2026-11-01').status).toBe('before_plan');
    expect(expectedWeightOn(ms, '2027-12-01').status).toBe('after_plan');
    expect(expectedWeightOn([], '2027-01-01').status).toBe('no_plan');
  });
  it('pontos da linha de metas recortados no período', () => {
    const pts = planLinePoints(ms, '2026-12-02', '2027-01-20');
    expect(pts[0]).toMatchObject({ date: '2026-12-02' });
    expect(pts[0].plan).toBeCloseTo(99, 10);
    expect(pts.map((p) => p.date)).toContain('2026-12-17');
    expect(pts[pts.length - 1].date).toBe('2027-01-20');
  });
});

describe('Médias semanais', () => {
  it('semana com duas pesagens → "média de 2 registros"', () => {
    const w = weeklyAverages([{ date: '2026-11-17', weightKg: 100 }, { date: '2026-11-19', weightKg: 99 }]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ weekStart: '2026-11-16', count: 2, averageKg: 99.5 });
    expect(averageLabel(w[0].count)).toContain('média de 2 registros');
    expect(averageLabel(1)).toContain('parcial');
  });
  it('semanas começam na segunda-feira', () => {
    expect(weekday('2026-11-17')).toBe(2); // terça
    expect(weekStartMonday('2026-11-17')).toBe('2026-11-16');
    expect(weekStartMonday('2026-11-22')).toBe('2026-11-16'); // domingo pertence à semana anterior
    expect(weekStartMonday('2026-11-23')).toBe('2026-11-23');
  });
  it('variação semanal: dados insuficientes quando falta uma semana', () => {
    expect(weeklyChange([{ date: '2026-11-24', weightKg: 99 }], '2026-11-24')).toEqual({ kind: 'insufficient' });
    const ch = weeklyChange([{ date: '2026-11-17', weightKg: 100 }, { date: '2026-11-24', weightKg: 99.4 }], '2026-11-25');
    expect(ch.kind).toBe('ok');
    if (ch.kind === 'ok') expect(ch.deltaKg).toBeCloseTo(-0.6, 10);
  });
  it('peso atual = pesagem mais recente', () => {
    const l = latestWeight([
      { date: '2026-11-18', measuredAt: '2026-11-18T10:00:00Z', weightKg: 99.6 },
      { date: '2026-11-20', measuredAt: '2026-11-20T10:00:00Z', weightKg: 99.0 },
      { date: '2026-11-19', measuredAt: '2026-11-19T10:00:00Z', weightKg: 99.3 },
    ]);
    expect(l?.weightKg).toBe(99.0);
    expect(latestWeight([])).toBeNull();
  });
});

describe('Alimentação', () => {
  it('alimento sem dados nutricionais não inventa macros', () => {
    const n = nutrientsForAmount({ referenceAmount: 100, referenceUnit: 'g' }, 150, 'g');
    expect(n).toEqual({ kcal: undefined, proteinG: undefined, carbsG: undefined, fatG: undefined, nutritionIsEstimated: false });
  });
  it('escala por quantidade e preserva kcal do rótulo', () => {
    const n = nutrientsForAmount({ referenceAmount: 100, referenceUnit: 'g', kcalPerReference: 128, proteinGPerReference: 2.5, carbsGPerReference: 28, fatGPerReference: 0.2 }, 150, 'g')!;
    expect(n.kcal).toBeCloseTo(192, 10);
    expect(n.proteinG).toBeCloseTo(3.75, 10);
    expect(n.nutritionIsEstimated).toBe(false);
  });
  it('estima kcal pelos macros apenas quando o rótulo não tem kcal', () => {
    const n = completeKcal({ proteinG: 10, carbsG: 20, fatG: 5, nutritionIsEstimated: false });
    expect(n.kcal).toBe(165);
    expect(n.nutritionIsEstimated).toBe(true);
    expect(completeKcal({ proteinG: 10, nutritionIsEstimated: false }).kcal).toBeUndefined();
  });
  it('unidades incompatíveis não são convertidas às cegas', () => {
    expect(nutrientsForAmount({ referenceAmount: 1, referenceUnit: 'unit', kcalPerReference: 70 }, 50, 'g')).toBeNull();
  });
  it('dia sem registro não vira "0 kcal consumidas"', () => {
    const t = dayTotals([]);
    expect(t.hasEntries).toBe(false);
    expect(kcalSummaryText(t)).toBe('Nenhum alimento registrado');
    expect(kcalSummaryText(t)).not.toMatch(/0 kcal/);
  });
  it('totais sinalizam itens sem dados', () => {
    const t = dayTotals([
      { kcal: 300, proteinG: 20, carbsG: 30, fatG: 10, nutritionIsEstimated: false },
      { nutritionIsEstimated: false },
    ]);
    expect(t.kcal).toBe(300);
    expect(t.itemsMissingKcal).toBe(1);
    expect(kcalSummaryText(t)).toContain('1 item sem dados');
  });
  it('adesão usa dias registrados como denominador', () => {
    const tg: NutritionTargets[] = [{ id: 't', effectiveDate: '2026-11-17', caloriesKcal: 2500, proteinG: 180, carbsG: 265, fatG: 80, waterMinMl: 2500, waterMaxMl: 3500, createdAt: '' }];
    const logs = new Map([['2026-11-17', [{ kcal: 2500, proteinG: 185, carbsG: 260, fatG: 80, nutritionIsEstimated: false }]]]);
    const a = nutritionAdherence(['2026-11-17', '2026-11-18', '2026-11-19'], logs, tg);
    expect(a).toEqual({ daysInPeriod: 3, daysLogged: 1, daysProteinHit: 1, daysWithinKcal: 1 });
  });
  it('metas com vigência não reescrevem o passado', () => {
    const tg: NutritionTargets[] = [
      { id: 'a', effectiveDate: '2026-11-17', ...INITIAL_TARGETS, caloriesKcal: 2500, createdAt: '2026-11-17T00:00:00Z' },
      { id: 'b', effectiveDate: '2026-12-10', ...INITIAL_TARGETS, caloriesKcal: 2350, createdAt: '2026-12-10T00:00:00Z' },
    ];
    expect(targetsForDate(tg, '2026-12-01')?.caloriesKcal).toBe(2500);
    expect(targetsForDate(tg, '2026-12-10')?.caloriesKcal).toBe(2350);
  });
});

describe('Datas', () => {
  it('17/11/2026 permanece no dia certo em qualquer horário/fuso', () => {
    expect(formatBR('2026-11-17')).toBe('17/11/2026');
    expect(parseBR('17/11/2026')).toBe('2026-11-17');
    // 23h30 em São Paulo = 02h30 UTC do dia 18 → continua sendo 17/11 em SP
    expect(dateInTimeZone(new Date('2026-11-18T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-11-17');
    // 00h05 em SP do dia 17
    expect(dateInTimeZone(new Date('2026-11-17T03:05:00Z'), 'America/Sao_Paulo')).toBe('2026-11-17');
    expect(addDays('2026-11-17', 0)).toBe('2026-11-17');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('valida datas', () => {
    expect(isISODate('2027-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(parseBR('31/02/2027')).toBeNull();
  });
  it('decimais no formato brasileiro', () => {
    expect(parseDecimal('99,6')).toBe(99.6);
    expect(parseDecimal('99.6')).toBe(99.6);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
});

describe('Revisão de tendência (só sugere)', () => {
  it('poucos dados → insuficiente', () => {
    expect(reviewTrend([{ date: '2026-11-17', weightKg: 100 }], '2026-11-20').kind).toBe('insufficient');
  });
  it('4 semanas sem queda → estagnação', () => {
    const e = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].flatMap((d) => [
      { date: d, weightKg: 99 }, { date: addDays(d, 2), weightKg: 99.2 },
    ]);
    expect(reviewTrend(e, '2026-11-25').kind).toBe('stalled');
  });
});
