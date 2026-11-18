import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Alert, Button, Card, EmptyState, Page, Segmented, Select, Stat, cx } from '../../components/ui';
import { WeightChart } from '../../components/charts/WeightChart';
import { useProfile, useSave, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { saveMilestone } from '../../data/repo';
import {
  averageLabel, bmi, expectedWeightOn, fmt, latestWeight, progressToGoal, sortMilestones, weeklyAverages, weeklyChange,
} from '../../domain/calculations';
import { addDays, diffDays, formatBR, formatShortBR, weekStartMonday } from '../../domain/dates';
import type { GoalMilestone, WeightEntry } from '../../domain/types';

type Range = '7' | '30' | '90' | 'all';
const MS_STATUS: Record<NonNullable<GoalMilestone['status']>, string> = { pending: 'Ainda não atingido', reached: 'Atingido', not_reached: 'Não atingido', rescheduled: 'Remarcado' };
const MS_ICON: Record<NonNullable<GoalMilestone['status']>, string> = { pending: '○', reached: '✔', not_reached: '✕', rescheduled: '↷' };

export function Progress() {
  const today = useToday();
  const profile = useProfile();
  const { open } = useSheets();
  const save = useSave();
  const [range, setRange] = useState<Range>('30');
  const [showAll, setShowAll] = useState(false);
  const weights = useLiveQuery(() => db.weights.toArray(), [], [] as WeightEntry[]);
  const milestones = useLiveQuery(() => db.milestones.toArray(), []) ?? [];
  const measurements = useLiveQuery(() => db.measurements.orderBy('measuredOn').reverse().toArray(), []) ?? [];

  const sortedWeights = useMemo(() => [...weights].sort((a, b) => b.date.localeCompare(a.date) || b.measuredAt.localeCompare(a.measuredAt)), [weights]);
  const weeks = useMemo(() => weeklyAverages(weights).reverse(), [weights]);
  const current = latestWeight(weights);
  const start = profile?.startWeightKg ?? 0;
  const goal = profile?.goalWeightKg ?? 0;
  const prog = current ? progressToGoal(start, current.weightKg, goal) : null;
  const change = weeklyChange(weights, today);
  const thisWeek = weeks.find((w) => w.weekStart === weekStartMonday(today));
  const expected = expectedWeightOn(milestones, today);

  const earliest = weights.reduce((m, w) => (w.date < m ? w.date : m), profile?.startDate ?? today);
  const from = range === 'all' ? earliest : addDays(today, -Number(range) + 1);
  // Mostra também um trecho à frente para a linha de metas indicar a direção.
  const to = range === 'all' ? (profile?.targetDate && profile.targetDate > today ? profile.targetDate : today) : addDays(today, Math.max(3, Math.round(Number(range) / 3)));

  return (
    <Page title="Evolução" subtitle="Peso, médias semanais, marcos e medidas"
      action={<Button onClick={() => open({ kind: 'weight' })}>+ Peso</Button>}>
      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={current ? 'Peso atual' : 'Referência inicial'} value={fmt(current?.weightKg ?? start)} unit="kg" sub={current ? formatBR(current.date) : 'sem pesagem'} />
          <Stat label="IMC" value={fmt(bmi(current?.weightKg ?? start, profile?.heightCm ?? 0))} sub={current ? 'com peso atual' : 'referência'} />
          <Stat label="Avanço" value={prog ? fmt(prog.percentClamped) : '—'} unit={prog ? '%' : undefined} sub={prog ? `${prog.changeKg >= 0 ? '−' : '+'}${fmt(Math.abs(prog.changeKg))} kg` : 'aguardando'} />
        </div>
        <p className="mt-3 text-xs text-muted">O IMC não mede composição corporal (músculo × gordura). O avanço é a fração do caminho {fmt(start)} → {fmt(goal)} kg — não é percentual de gordura.</p>
      </Card>

      <Card title="Gráfico" action={<span className="text-xs text-muted">{weights.length} {weights.length === 1 ? 'pesagem' : 'pesagens'}</span>}>
        <div className="mb-3"><Segmented label="Período do gráfico" value={range} onChange={setRange} options={[{ value: '7', label: '7 d' }, { value: '30', label: '30 d' }, { value: '90', label: '90 d' }, { value: 'all', label: 'Tudo' }]} /></div>
        <WeightChart weights={weights} milestones={milestones} from={from} to={to} height={240} />
        {expected.valueKg !== null && (
          <p className="mt-2 text-sm text-muted">
            {expected.status === 'in_plan' ? <>Meta de referência para hoje: <b className="num text-fg">{fmt(expected.valueKg)} kg</b> (aprox. 0,4–0,5 kg/semana; oscilações são normais).</>
              : expected.status === 'before_plan' ? 'Hoje está antes do início do plano.' : 'Fora do plano: a data-alvo já passou — revise as metas no Perfil.'}
          </p>
        )}
      </Card>

      <Card title="Médias semanais (segunda a domingo)">
        <div className="mb-3 grid grid-cols-2 gap-3">
          <Stat label="Semana atual" value={thisWeek ? fmt(thisWeek.averageKg) : '—'} unit={thisWeek ? 'kg' : undefined} sub={averageLabel(thisWeek?.count ?? 0)} />
          <Stat label="Diferença p/ semana anterior" value={change.kind === 'ok' ? `${change.deltaKg > 0 ? '+' : change.deltaKg < 0 ? '−' : ''}${fmt(Math.abs(change.deltaKg))}` : '—'} unit={change.kind === 'ok' ? 'kg' : undefined} sub={change.kind === 'insufficient' ? 'dados insuficientes' : 'compare médias, não pesagens isoladas'} />
        </div>
        {weeks.length === 0 ? <EmptyState icon="⚖️">Seu primeiro registro aparecerá aqui. Sugestão: 3 manhãs por semana.</EmptyState> : (
          <table className="w-full text-sm">
            <caption className="sr-only">Médias semanais de peso</caption>
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Semana</th><th className="py-1 font-medium text-right">Média</th><th className="py-1 font-medium text-right">Registros</th></tr></thead>
            <tbody>
              {weeks.slice(0, 8).map((w) => (
                <tr key={w.weekStart} className="border-t border-line">
                  <td className="py-2">{formatShortBR(w.weekStart)}–{formatShortBR(addDays(w.weekStart, 6))}</td>
                  <td className="num py-2 text-right font-semibold">{fmt(w.averageKg)} kg</td>
                  <td className="py-2 text-right text-muted">{w.count < 3 ? `${w.count} (parcial)` : w.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Pesagens">
        {sortedWeights.length === 0 ? <EmptyState icon="⚖️">Nenhuma pesagem ainda. {fmt(start)} kg é apenas a referência inicial.</EmptyState> : (
          <>
            <ul className="divide-y divide-line">
              {(showAll ? sortedWeights : sortedWeights.slice(0, 10)).map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => open({ kind: 'weight', entry: w })} className="flex w-full items-center justify-between gap-2 py-2.5 text-left" aria-label={`Editar pesagem de ${formatBR(w.date)}`}>
                    <span className="text-sm">{formatBR(w.date)}{w.time && <span className="text-muted"> · {w.time}</span>}{w.note && <span className="block text-xs text-muted">{w.note}</span>}</span>
                    <span className="num font-semibold">{fmt(w.weightKg)} kg <span aria-hidden className="text-muted">›</span></span>
                  </button>
                </li>
              ))}
            </ul>
            {sortedWeights.length > 10 && <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(!showAll)}>{showAll ? 'Mostrar menos' : `Ver todas (${sortedWeights.length})`}</Button>}
          </>
        )}
      </Card>

      <Card title="Calendário de marcos">
        <ul className="space-y-2">
          {sortMilestones(milestones).map((m) => {
            const st = m.status ?? 'pending';
            const past = diffDays(m.date, today) < 0;
            const near = weights.filter((w) => Math.abs(diffDays(w.date, m.date)) <= 3);
            const avgNear = near.length ? near.reduce((s, w) => s + w.weightKg, 0) / near.length : null;
            return (
              <li key={m.id} className={cx('flex flex-wrap items-center gap-3 rounded-xl border p-3', m.date === today ? 'border-accent' : 'border-line')}>
                <span aria-hidden className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm', st === 'reached' ? 'bg-accent text-accent-fg' : 'bg-card2')}>{MS_ICON[st]}</span>
                <div className="min-w-0 flex-1">
                  <p className="num font-semibold">{formatBR(m.date)} · {fmt(m.targetWeightKg)} kg</p>
                  <p className="text-xs text-muted">
                    {avgNear !== null ? `Média registrada ±3 dias: ${fmt(avgNear)} kg (${near.length})` : past ? 'Sem pesagem próxima a esta data' : `em ${diffDays(m.date, today)} dias`}
                  </p>
                </div>
                <Select aria-label={`Situação do marco de ${formatBR(m.date)}`} value={st} className="!min-h-9 w-full py-1 text-sm sm:w-40"
                  onChange={(e) => save(() => saveMilestone({ ...m, status: e.target.value as GoalMilestone['status'] }), 'Marco atualizado')}>
                  {Object.entries(MS_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">Marcos são referências, não limites. Edite datas e pesos em Perfil → Plano.</p>
      </Card>

      <Card title="Medidas corporais" action={<Button variant="ghost" onClick={() => open({ kind: 'measure' })}>+ Medidas</Button>}>
        {measurements.length === 0 ? <EmptyState icon="📏">Medir cintura no umbigo no dia 17 de cada mês, em condições parecidas.</EmptyState> : (
          <ul className="divide-y divide-line">
            {measurements.map((m, i) => {
              const prev = measurements.slice(i + 1).find((x) => x.waistCm !== undefined);
              const dw = m.waistCm !== undefined && prev?.waistCm !== undefined ? m.waistCm - prev.waistCm : null;
              return (
                <li key={m.id}>
                  <button type="button" className="w-full py-2.5 text-left" onClick={() => open({ kind: 'measure', entry: m })}>
                    <p className="text-sm font-semibold">{formatBR(m.measuredOn)}{m.waistCm !== undefined && <> · cintura <span className="num">{fmt(m.waistCm)} cm</span>{dw !== null && <span className="text-muted"> ({dw > 0 ? '+' : dw < 0 ? '−' : ''}{fmt(Math.abs(dw))})</span>}</>}</p>
                    <p className="text-xs text-muted">
                      {[m.hipCm !== undefined && `quadril ${fmt(m.hipCm)}`, m.chestCm !== undefined && `peito ${fmt(m.chestCm)}`, m.armCm !== undefined && `braço ${fmt(m.armCm)}`, m.thighCm !== undefined && `coxa ${fmt(m.thighCm)}`, m.bodyFatPercent !== undefined && `gordura ${fmt(m.bodyFatPercent)}% (medida: ${m.bodyFatMethod})`].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Alert tone="info" title="Fotos de progresso">Fotos privadas, comparações e marcação “foto real” × “simulação” chegam na Fase 3. Nada é enviado para servidores.</Alert>
    </Page>
  );
}
