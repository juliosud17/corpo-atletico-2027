// Relatório HTML imprimível e autônomo (sem serviços externos). Abrir no navegador → Imprimir → PDF.
import { averageLabel, expectedWeightOn, fmt, fmtInt, planLinePoints, sortMilestones, weeklyAverages } from '../../domain/calculations';
import { addDays, formatBR, formatShortBR, monthLabel, toDayNumber } from '../../domain/dates';
import { monthlySummary, weeklySummary, type ReportData } from '../../domain/reports';
import type { UserProfile } from '../../domain/types';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function weightSvg(data: ReportData, from: string, to: string): string {
  const W = 680, H = 240, L = 44, R = 12, T = 12, B = 28;
  const real = data.weights.filter((w) => w.date >= from && w.date <= to).map((w) => ({ x: toDayNumber(w.date), y: w.weightKg })).sort((a, b) => a.x - b.x);
  const plan = planLinePoints(data.milestones, from, to).map((p) => ({ x: p.day, y: p.plan }));
  const ys = [...real, ...plan].map((p) => p.y);
  if (!ys.length) return '<p class="muted">Sem dados registrados no período.</p>';
  const y0 = Math.floor(Math.min(...ys) - 1), y1 = Math.ceil(Math.max(...ys) + 1);
  const x0 = toDayNumber(from), x1 = Math.max(toDayNumber(to), x0 + 1);
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil((y1 - y0) / 5));
  const ticks: number[] = [];
  for (let t = y0; t <= y1; t += step) ticks.push(t);
  const xt = Array.from({ length: 5 }, (_, i) => Math.round(x0 + ((x1 - x0) * i) / 4));
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso registrado e meta de referência" style="width:100%;height:auto">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" stroke="#e5e7eb"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="#6b7280">${Math.round(t)}</text>`).join('')}
    ${xt.map((x) => `<text x="${sx(x)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="#6b7280">${formatShortBR(addDays('1970-01-01', x))}</text>`).join('')}
    ${plan.length ? `<path d="${path(plan)}" fill="none" stroke="#6b7280" stroke-width="2" stroke-dasharray="6 5"/>` : ''}
    ${real.length > 1 ? `<path d="${path(real)}" fill="none" stroke="#15803d" stroke-width="2.5"/>` : ''}
    ${real.map((p) => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5" fill="#15803d" stroke="#fff" stroke-width="1.5"/>`).join('')}
  </svg>
  <p class="legend"><span class="sw real"></span> Peso registrado &nbsp; <span class="sw plan"></span> Meta de referência (interpolada)</p>`;
}

export interface HtmlReportOptions {
  from: string; to: string; today: string;
  profile: UserProfile;
  photoThumbs?: { capturedOn: string; angle: string; dataUrl: string }[];
}

export function buildHtmlReport(data: ReportData, o: HtmlReportOptions): string {
  const months: string[] = [];
  for (let m = o.from.slice(0, 7); m <= o.to.slice(0, 7);) {
    months.push(m);
    const [y, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  const weeks = weeklyAverages(data.weights).filter((w) => w.weekStart >= addDays(o.from, -6) && w.weekStart <= o.to);
  const ms = sortMilestones(data.milestones);
  const p = o.profile;
  const row = (cells: unknown[]) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;

  const monthly = months.map((m) => {
    const s = monthlySummary(data, m, o.today);
    return row([
      monthLabel(m),
      s.expectedAtCheckpoint !== null ? `${fmt(s.expectedAtCheckpoint)} kg` : '—',
      s.weightNearCheckpoint !== null ? `${fmt(s.weightNearCheckpoint)} kg (${s.weightNearCount})` : 'sem pesagem',
      s.waist ? `${fmt(s.waist.cm)} cm` : '—',
      `${s.nutrition.daysLogged}/${s.nutrition.daysInPeriod}`,
      `${s.training.completed + s.training.partial}`,
      `${s.daysWithAnyRecord}/${s.daysElapsed}`,
    ]);
  }).join('');

  const weekly = [...weeks].reverse().map((w) => {
    const s = weeklySummary(data, w.weekStart);
    return row([
      `${formatShortBR(s.weekStart)}–${formatShortBR(s.weekEnd)}`,
      `${fmt(w.averageKg)} kg · ${averageLabel(w.count)}`,
      s.deltaVsPrevious !== null ? `${s.deltaVsPrevious > 0 ? '+' : ''}${fmt(s.deltaVsPrevious)} kg` : 'dados insuficientes',
      s.nutrition.daysLogged ? `${fmtInt(s.nutrition.avgKcal)} kcal · P ${fmtInt(s.nutrition.avgProteinG)} g (${s.nutrition.daysLogged} dias)` : 'sem registros',
      `${s.training.completed + s.training.partial} · cardio ${s.training.cardioMinutes} min`,
      s.sleepAvg !== null ? `${fmt(s.sleepAvg)} h` : '—',
    ]);
  }).join('');

  const measures = data.measurements.filter((m) => m.measuredOn >= o.from && m.measuredOn <= o.to).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((m) => row([formatBR(m.measuredOn), m.waistCm !== undefined ? fmt(m.waistCm) : '—', m.hipCm !== undefined ? fmt(m.hipCm) : '—', m.chestCm !== undefined ? fmt(m.chestCm) : '—', m.armCm !== undefined ? fmt(m.armCm) : '—', m.thighCm !== undefined ? fmt(m.thighCm) : '—', m.bodyFatPercent !== undefined ? `${fmt(m.bodyFatPercent)}% (${m.bodyFatMethod ?? 'medido'})` : '—'])).join('');

  const photos = (o.photoThumbs ?? []).map((ph) => `<figure><img src="${ph.dataUrl}" alt="Foto real de ${esc(formatBR(ph.capturedOn))}"/><figcaption><b>FOTO REAL</b> · ${esc(formatBR(ph.capturedOn))} · ${esc(ph.angle)}</figcaption></figure>`).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório Corpo Atlético 2027 — ${esc(formatBR(o.from))} a ${esc(formatBR(o.to))}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;margin:24px;max-width:860px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:2px solid #e5e7eb;padding-bottom:4px}
.muted{color:#6b7280;font-size:13px}table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{border-bottom:1px solid #e5e7eb;padding:6px 4px;text-align:left;vertical-align:top}th{color:#6b7280;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpi{border:1px solid #e5e7eb;border-radius:10px;padding:8px}
.kpi b{display:block;font-size:18px}.legend{font-size:12px;color:#6b7280}.sw{display:inline-block;width:18px;height:3px;vertical-align:middle}
.sw.real{background:#15803d}.sw.plan{background:repeating-linear-gradient(90deg,#6b7280 0 5px,transparent 5px 9px)}
.photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}figure{margin:0}figure img{width:100%;border-radius:8px}figcaption{font-size:11px}
@media print{body{margin:0}h2{break-after:avoid}table,figure{break-inside:avoid}}
</style></head><body>
<h1>Corpo Atlético 2027 — relatório</h1>
<p class="muted">${esc(p.displayName)} · período ${esc(formatBR(o.from))} a ${esc(formatBR(o.to))} · gerado em ${esc(formatBR(o.today))}. Dados registrados pelo usuário; estimativas indicadas como tal. Não é documento clínico.</p>
<div class="grid">
  <div class="kpi"><span class="muted">Início</span><b>${fmt(p.startWeightKg)} kg</b><span class="muted">${esc(formatBR(p.startDate))}</span></div>
  <div class="kpi"><span class="muted">Objetivo</span><b>${fmt(p.goalWeightKg)} kg</b><span class="muted">${esc(formatBR(p.targetDate))}</span></div>
  <div class="kpi"><span class="muted">Meta de referência em ${esc(formatBR(o.to))}</span><b>${(() => { const e = expectedWeightOn(ms, o.to); return e.valueKg !== null ? `${fmt(e.valueKg)} kg` : '—'; })()}</b></div>
  <div class="kpi"><span class="muted">Pesagens no período</span><b>${data.weights.filter((w) => w.date >= o.from && w.date <= o.to).length}</b></div>
</div>
<h2>Peso: registrado × meta</h2>${weightSvg(data, o.from, o.to)}
<h2>Resumo mensal</h2>
<table><thead><tr><th>Mês</th><th>Meta no dia 17</th><th>Média ±3 dias do dia 17</th><th>Cintura</th><th>Dias c/ alimentação</th><th>Treinos feitos</th><th>Dias c/ algum registro</th></tr></thead><tbody>${monthly}</tbody></table>
<h2>Resumo semanal</h2>
${weekly ? `<table><thead><tr><th>Semana</th><th>Média de peso</th><th>Δ semana anterior</th><th>Alimentação (média dos dias registrados)</th><th>Treinos</th><th>Sono médio</th></tr></thead><tbody>${weekly}</tbody></table>` : '<p class="muted">Sem pesagens no período.</p>'}
<h2>Medidas (cm)</h2>
${measures ? `<table><thead><tr><th>Data</th><th>Cintura</th><th>Quadril</th><th>Peito</th><th>Braço</th><th>Coxa</th><th>Gordura medida</th></tr></thead><tbody>${measures}</tbody></table>` : '<p class="muted">Sem medidas no período.</p>'}
${photos ? `<h2>Fotos reais</h2><div class="photos">${photos}</div>` : ''}
<p class="muted" style="margin-top:28px">IMC e estimativas não medem composição corporal. Médias de alimentação consideram apenas dias registrados — dias sem registro não são tratados como consumo zero.</p>
</body></html>`;
}
