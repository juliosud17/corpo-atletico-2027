import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, Page, Segmented, Stat, TextInput, useToast } from '../../components/ui';
import { useProfile, useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { download } from '../../app/download';
import { db } from '../../data/db';
import { logReview } from '../../data/repo';
import { averageLabel, fmt, fmtInt, reviewTrend } from '../../domain/calculations';
import { addDays, diffDays, formatBR, formatShortBR, monthKey, monthLabel, weekStartMonday } from '../../domain/dates';
import { bufferToBase64 } from '../../domain/binary';
import { monthlySummary, periodNutrition, periodTraining, reviewStatus, toCSV, weeklySummary, type ReportData } from '../../domain/reports';
import { buildHtmlReport } from './htmlReport';
import { useReportData } from './useReportData';
import { ANGLE_LABEL } from '../photos/Photos';

const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
const shiftMonth = (m: string, d: number) => { const [y, mm] = m.split('-').map(Number); const t = y * 12 + (mm - 1) + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };

function Weekly({ data, today }: { data: ReportData; today: string }) {
  const [ws, setWs] = useState(weekStartMonday(today));
  const s = weeklySummary(data, ws);
  const n = s.nutrition, t = s.training;
  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Semana anterior" onClick={() => setWs(addDays(ws, -7))}>‹</Button>
        <p className="flex-1 text-center font-semibold">{formatShortBR(s.weekStart)} – {formatBR(s.weekEnd)}</p>
        <Button variant="secondary" aria-label="Próxima semana" disabled={addDays(ws, 7) > today} onClick={() => setWs(addDays(ws, 7))}>›</Button>
      </div>
      <Card title="Peso">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Média real" value={s.weightAvg !== null ? fmt(s.weightAvg) : '—'} unit={s.weightAvg !== null ? 'kg' : undefined} sub={averageLabel(s.weightCount)} />
          <Stat label="Vs. semana anterior" value={s.deltaVsPrevious !== null ? `${sign(s.deltaVsPrevious)}${fmt(Math.abs(s.deltaVsPrevious))}` : '—'} unit={s.deltaVsPrevious !== null ? 'kg' : undefined} sub={s.deltaVsPrevious === null ? 'dados insuficientes' : undefined} />
        </div>
        <p className="mt-2 text-sm text-muted">Cintura mais recente: {s.latestWaist ? `${fmt(s.latestWaist.cm)} cm (${formatBR(s.latestWaist.date)})` : '—'}</p>
      </Card>
      <Card title="Alimentação (dias registrados)">
        {n.daysLogged === 0 ? <p className="text-sm text-muted">Nenhum dia com alimentação registrada nesta semana.</p> : (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Dias registrados" value={`${n.daysLogged}/${n.daysInPeriod}`} />
            <Stat label="Meta de proteína" value={`${n.daysProteinHit}/${n.daysLogged}`} sub="dias registrados" />
            <Stat label="Média kcal" value={fmtInt(n.avgKcal)} sub={n.daysWithMissingData ? `${n.daysWithMissingData} dia(s) com itens sem dados` : 'nos dias registrados'} />
            <Stat label="Média P / C / G" value={`${fmtInt(n.avgProteinG)}/${fmtInt(n.avgCarbsG)}/${fmtInt(n.avgFatG)}`} unit="g" />
          </div>
        )}
      </Card>
      <Card title="Treinos e recuperação">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Concluídos / parciais" value={`${t.completed} / ${t.partial}`} sub={`${t.planned} dias planejados`} />
          <Stat label="Cardio" value={t.cardioMinutes} unit="min" sub={`${t.sets} séries registradas`} />
          <Stat label="Não liberados / adiados" value={`${t.notCleared} / ${t.postponedOrCancelled}`} />
          <Stat label="Sono médio" value={s.sleepAvg !== null ? fmt(s.sleepAvg) : '—'} unit={s.sleepAvg !== null ? 'h' : undefined} sub={s.sleepCount ? `${s.sleepCount} registro(s)` : 'sem registro'} />
        </div>
        {t.sessionsWithPain > 0 && <p className="mt-2 text-sm text-warn">⚠ {t.sessionsWithPain} sessão(ões) com dor ou desconforto anotado.</p>}
      </Card>
      <Card title="Notas da semana">
        {s.notes.length === 0 ? <p className="text-sm text-muted">Sem notas.</p> : <ul className="space-y-1 text-sm">{s.notes.map((x, i) => <li key={i}><span className="text-muted">{formatShortBR(x.date)}:</span> {x.text}</li>)}</ul>}
      </Card>
    </>
  );
}

function Monthly({ data, today }: { data: ReportData; today: string }) {
  const [month, setMonth] = useState(monthKey(today));
  const s = monthlySummary(data, month, today);
  const diff = s.expectedAtCheckpoint !== null && s.weightNearCheckpoint !== null ? s.weightNearCheckpoint - s.expectedAtCheckpoint : null;
  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
        <p className="flex-1 text-center font-semibold first-letter:uppercase">{monthLabel(month)}</p>
        <Button variant="secondary" aria-label="Próximo mês" disabled={shiftMonth(month, 1) > monthKey(today)} onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
      </div>
      <Card title={`Marco do dia ${formatShortBR(s.checkpoint)}`}>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Meta de referência" value={s.expectedAtCheckpoint !== null ? fmt(s.expectedAtCheckpoint) : '—'} unit="kg" />
          <Stat label="Média registrada ±3 dias" value={s.weightNearCheckpoint !== null ? fmt(s.weightNearCheckpoint) : '—'} unit={s.weightNearCheckpoint !== null ? 'kg' : undefined} sub={s.weightNearCount ? `${s.weightNearCount} pesagem(ns)` : 'sem pesagem próxima'} />
        </div>
        {diff !== null && <p className="mt-2 text-sm">{Math.abs(diff) < 0.3 ? 'Em linha com a referência.' : diff < 0 ? `${fmt(Math.abs(diff))} kg abaixo da referência.` : `${fmt(diff)} kg acima da referência — marcos são referências, não limites.`}</p>}
        <p className="mt-1 text-sm text-muted">Média do mês: {s.monthWeightAvg !== null ? `${fmt(s.monthWeightAvg)} kg (${s.monthWeightCount} pesagens)` : 'sem pesagens'}</p>
      </Card>
      <Card title="Medidas e fotos">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cintura no mês" value={s.waist ? fmt(s.waist.cm) : '—'} unit={s.waist ? 'cm' : undefined} sub={s.waist ? formatBR(s.waist.date) : 'não medida'} />
          <Stat label="Vs. medida anterior" value={s.waist && s.waistPrevious ? `${sign(s.waist.cm - s.waistPrevious.cm)}${fmt(Math.abs(s.waist.cm - s.waistPrevious.cm))}` : '—'} unit={s.waist && s.waistPrevious ? 'cm' : undefined} sub={s.waistPrevious ? `anterior: ${formatBR(s.waistPrevious.date)}` : 'sem medida anterior'} />
        </div>
        <p className="mt-2 text-sm text-muted">Fotos reais no mês: {s.realPhotos}</p>
      </Card>
      <Card title="Constância">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Dias com algum registro" value={`${s.daysWithAnyRecord}/${s.daysElapsed}`} />
          <Stat label="Dias com alimentação" value={`${s.nutrition.daysLogged}/${s.daysElapsed}`} sub={s.nutrition.daysLogged ? `proteína: ${s.nutrition.daysProteinHit}/${s.nutrition.daysLogged}` : undefined} />
          <Stat label="Treinos feitos" value={s.training.completed + s.training.partial} sub={`cardio ${s.training.cardioMinutes} min`} />
          <Stat label="Média kcal (dias reg.)" value={fmtInt(s.nutrition.avgKcal)} />
        </div>
      </Card>
      <Card title="Avanços no treino">
        {s.exerciseProgress.length === 0 ? <p className="text-sm text-muted">São necessárias pelo menos duas sessões com carga do mesmo exercício no mês.</p> : (
          <ul className="divide-y divide-line text-sm">
            {s.exerciseProgress.map((e) => (
              <li key={e.name} className="flex justify-between gap-2 py-2"><span>{e.name}</span><span className="num shrink-0">{fmt(e.firstLoad)} → <b>{fmt(e.lastLoad)}</b> kg <span className="text-muted">({e.sessions} sessões)</span></span></li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Review({ data, today }: { data: ReportData; today: string }) {
  const settings = useSettingsOrDefault();
  const profile = useProfile();
  const save = useSave();
  const [note, setNote] = useState('');
  const st = reviewStatus(settings.reviewLog, profile?.startDate ?? today, today);
  const trend = reviewTrend(data.weights, today);
  const from = addDays(today, -13);
  const n = periodNutrition(data.foodLogs, data.targets, from, today);
  const t = periodTraining(data.workouts, data.plans, data.sets, from, today);
  const w = data.weights.filter((x) => x.date >= from && x.date <= today).length;
  const goodAdherence = n.daysLogged >= 11 && w >= 5;
  return (
    <>
      <Card title="Revisão a cada 14–21 dias">
        <p className="text-[15px]">{st.lastDate ? `Última revisão: ${formatBR(st.lastDate)} (${st.daysSince} dias).` : 'Nenhuma revisão registrada ainda.'} {st.overdue ? 'Já passou de 21 dias.' : st.due ? 'Está na hora de revisar.' : `Próxima a partir de ${formatBR(addDays(st.lastDate ?? profile?.startDate ?? today, 14))}.`}</p>
      </Card>
      <Card title="Últimos 14 dias">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Pesagens" value={w} sub="referência: ~6" />
          <Stat label="Dias com alimentação" value={`${n.daysLogged}/14`} sub={n.daysLogged ? `proteína: ${n.daysProteinHit}/${n.daysLogged}` : undefined} />
          <Stat label="Treinos feitos" value={t.completed + t.partial} sub={`${t.planned} planejados`} />
          <Stat label="Cardio" value={t.cardioMinutes} unit="min" />
        </div>
      </Card>
      <Card title="Tendência e sugestões">
        {trend.kind === 'insufficient' && <p className="text-sm text-muted">{trend.reason}</p>}
        {trend.kind === 'on_track' && <p className="text-sm">Média caindo cerca de <b>{fmt(trend.avgLossPerWeek, 2)} kg/semana</b> nas últimas semanas. Seguir o plano.</p>}
        {trend.kind === 'stalled' && (
          <Alert tone="info" title="Média estável há ~3 semanas">
            {goodAdherence
              ? 'Com registros suficientes e boa adesão, vale revisar porções, atividade e a orientação nutricional. Exemplo para discussão: ajuste de 150–200 kcal/dia. Nada é alterado automaticamente — a meta só muda se você editar em Perfil.'
              : 'Antes de mudar metas, vale melhorar a constância dos registros (alimentação e pesagens) para ter uma leitura confiável.'}
          </Alert>
        )}
        {trend.kind === 'fast' && <Alert tone="warn" title="Queda rápida">Média caindo mais de 1 kg/semana. Se houver fraqueza, fadiga ou piora, revise o plano com um profissional.</Alert>}
        <p className="mt-2 text-xs text-muted">A análise usa médias semanais, nunca um peso isolado.</p>
      </Card>
      <Card title="Registrar revisão">
        <Field label="O que você decidiu ou observou (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: manter metas; conversar com nutricionista" />}</Field>
        <Button className="mt-3 w-full" onClick={async () => { await save(() => logReview(today, note), 'Revisão registrada'); setNote(''); }}>Marcar revisão de hoje</Button>
        {(settings.reviewLog?.length ?? 0) > 0 && (
          <ul className="mt-3 space-y-1 text-sm">{[...settings.reviewLog!].reverse().slice(0, 12).map((r) => <li key={r.date}><span className="text-muted">{formatBR(r.date)}</span>{r.note ? ` — ${r.note}` : ''}</li>)}</ul>
        )}
      </Card>
    </>
  );
}

function Export({ data, today }: { data: ReportData; today: string }) {
  const profile = useProfile();
  const settings = useSettingsOrDefault();
  const { show } = useToast();
  const foods = useLiveQuery(() => db.foodItems.toArray(), []) ?? [];
  const [fromState, setFrom] = useState<string | null>(null);
  // Padrão: desde o início do plano (o perfil carrega de forma assíncrona).
  const from = fromState ?? profile?.startDate ?? addDays(today, -29);
  const [to, setTo] = useState(today);
  const [withPhotos, setWithPhotos] = useState(false);
  const planName = (id?: string) => data.plans.find((p) => p.id === id)?.name ?? 'Avulso';
  const sessionDate = new Map(data.workouts.map((w) => [w.id, w]));
  const inR = (d: string) => d >= from && d <= to;
  const file = (k: string) => `corpo-atletico-${k}-${from}-a-${to}.csv`;
  const csv = (name: string, headers: string[], rows: unknown[][]) => { download(file(name), toCSV(headers, rows), 'text/csv;charset=utf-8'); show(`${rows.length} linha(s) exportada(s)`, 'ok'); };

  async function exportHtml() {
    if (!profile) return;
    let thumbs: { capturedOn: string; angle: string; dataUrl: string }[] = [];
    if (withPhotos) {
      const reals = data.photos.filter((p) => p.photoKind === 'real' && inR(p.capturedOn)).sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)).slice(0, 24);
      for (const p of reals) {
        const b = await db.photoBlobs.get(p.blobKey);
        if (b?.thumb) thumbs.push({ capturedOn: p.capturedOn, angle: ANGLE_LABEL[p.angle], dataUrl: `data:${b.type};base64,${bufferToBase64(b.thumb)}` });
      }
    } else thumbs = [];
    const html = buildHtmlReport(data, { from, to, today, profile, photoThumbs: thumbs });
    download(`relatorio-corpo-atletico-${from}-a-${to}.html`, html, 'text/html;charset=utf-8');
    show('Relatório gerado. Abra o arquivo e use Imprimir → Salvar como PDF, se quiser.', 'ok');
  }

  return (
    <>
      <Card title="Período">
        <div className="grid grid-cols-2 gap-3">
          <Field label="De">{(id) => <TextInput id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Até">{(id) => <TextInput id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" className="!min-h-9" onClick={() => { setFrom(addDays(today, -6)); setTo(today); }}>7 dias</Button>
          <Button variant="ghost" className="!min-h-9" onClick={() => { setFrom(addDays(today, -29)); setTo(today); }}>30 dias</Button>
          <Button variant="ghost" className="!min-h-9" onClick={() => { setFrom(profile?.startDate ?? from); setTo(today); }}>Desde o início</Button>
        </div>
      </Card>
      <Card title="Relatório imprimível (HTML)">
        <p className="text-sm text-muted">Gráfico real × meta, resumos mensais e semanais e medidas. Funciona offline; para PDF, abra o arquivo e use Imprimir.</p>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-[15px]">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
          Incluir miniaturas das fotos reais (simulações nunca entram)
        </label>
        <Button className="mt-2 w-full" onClick={exportHtml}>⬇ Gerar relatório HTML</Button>
      </Card>
      <Card title="Planilhas (CSV)">
        <p className="mb-3 text-sm text-muted">Separador “;” e vírgula decimal — abre direto no Excel, Numbers ou Google Planilhas.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => csv('pesagens', ['data', 'hora', 'peso_kg', 'observacao'], data.weights.filter((w) => inR(w.date)).sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, w.time, w.weightKg, w.note]))}>Pesagens</Button>
          <Button variant="secondary" onClick={() => csv('alimentacao', ['data', 'refeicao', 'alimento', 'quantidade', 'unidade', 'estado', 'kcal', 'kcal_estimada', 'proteina_g', 'carboidrato_g', 'gordura_g', 'fonte'], data.foodLogs.filter((l) => inR(l.date)).sort((a, b) => a.date.localeCompare(b.date) || a.consumedAt.localeCompare(b.consumedAt)).map((l) => [l.date, l.mealLabel, l.description, l.amount, l.unit, l.preparation, l.kcal, l.nutritionIsEstimated, l.proteinG, l.carbsG, l.fatG, foods.find((f) => f.id === l.foodId)?.source]))}>Alimentação</Button>
          <Button variant="secondary" onClick={() => csv('treinos', ['data', 'treino', 'situacao', 'duracao_min', 'cardio_min', 'modalidade', 'sem_liberacao', 'desconforto', 'observacoes'], data.workouts.filter((w) => inR(w.date) && !w.inProgress).sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, planName(w.planId), w.status, w.durationMin, w.cardioMinutes, w.cardioModality, !!w.confirmedWithoutClearance, w.discomfort, w.notes]))}>Treinos</Button>
          <Button variant="secondary" onClick={() => csv('series', ['data', 'treino', 'exercicio', 'serie', 'repeticoes', 'carga_kg', 'rpe', 'dor'], data.sets.filter((s) => { const w = sessionDate.get(s.sessionId); return w && inR(w.date) && !w.inProgress; }).sort((a, b) => sessionDate.get(a.sessionId)!.date.localeCompare(sessionDate.get(b.sessionId)!.date) || a.exerciseName.localeCompare(b.exerciseName) || a.order - b.order).map((s) => { const w = sessionDate.get(s.sessionId)!; return [w.date, planName(w.planId), s.exerciseName, s.order + 1, s.reps, s.loadKg, s.rpe, !!s.pain]; }))}>Séries</Button>
          <Button variant="secondary" onClick={() => csv('medidas', ['data', 'cintura_cm', 'quadril_cm', 'peito_cm', 'braco_cm', 'coxa_cm', 'gordura_percentual', 'metodo_gordura', 'observacao'], data.measurements.filter((m) => inR(m.measuredOn)).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn)).map((m) => [m.measuredOn, m.waistCm, m.hipCm, m.chestCm, m.armCm, m.thighCm, m.bodyFatPercent, m.bodyFatMethod, m.note]))}>Medidas</Button>
          <Button variant="secondary" onClick={() => {
            const rows: unknown[][] = [];
            for (let w = weekStartMonday(from); w <= to; w = addDays(w, 7)) {
              const s = weeklySummary(data, w);
              rows.push([s.weekStart, s.weekEnd, s.weightAvg !== null ? Math.round(s.weightAvg * 100) / 100 : null, s.weightCount, s.deltaVsPrevious !== null ? Math.round(s.deltaVsPrevious * 100) / 100 : null, s.nutrition.daysLogged, s.nutrition.avgKcal !== null ? Math.round(s.nutrition.avgKcal) : null, s.nutrition.avgProteinG !== null ? Math.round(s.nutrition.avgProteinG) : null, s.nutrition.daysProteinHit, s.training.completed, s.training.partial, s.training.cardioMinutes, s.sleepAvg !== null ? Math.round(s.sleepAvg * 10) / 10 : null, s.latestWaist?.cm]);
            }
            csv('resumo-semanal', ['semana_inicio', 'semana_fim', 'peso_medio_kg', 'pesagens', 'variacao_kg', 'dias_alimentacao', 'kcal_media_dias_registrados', 'proteina_media_g', 'dias_meta_proteina', 'treinos_concluidos', 'treinos_parciais', 'cardio_min', 'sono_medio_h', 'cintura_cm'], rows);
          }}>Resumo semanal</Button>
        </div>
        <p className="mt-3 text-xs text-muted">Arquivos gerados no aparelho, sem envio. {diffDays(to, from) + 1} dias selecionados. Fuso: {settings.timeZone}.</p>
      </Card>
    </>
  );
}

export function ReportsPage() {
  const today = useToday();
  const data = useReportData();
  const [tab, setTab] = useState<'week' | 'month' | 'review' | 'export'>('week');
  return (
    <Page title="Relatórios" subtitle="Resumos com base apenas no que foi registrado">
      <Segmented label="Tipo de relatório" value={tab} onChange={setTab} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }, { value: 'review', label: 'Revisão' }, { value: 'export', label: 'Exportar' }]} />
      {!data ? <EmptyState icon="⏳">Carregando…</EmptyState>
        : tab === 'week' ? <Weekly data={data} today={today} />
        : tab === 'month' ? <Monthly data={data} today={today} />
        : tab === 'review' ? <Review data={data} today={today} />
        : <Export data={data} today={today} />}
    </Page>
  );
}
