import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, EmptyState, Field, Page, ProgressBar, Sheet, TextInput, cx } from '../../components/ui';
import { useProfile, useSave, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { startLiveSession, updateProfile } from '../../data/repo';
import { addDays, formatBR, formatShortBR, monthLabel, weekStartMonday, weekday, weekdayName, weekdayShort } from '../../domain/dates';
import { monthGrid, weeklyCardioMinutes } from '../../domain/workouts';
import type { RecoveryEntry, WorkoutPlan, WorkoutSession } from '../../domain/types';
import { PlanEditor } from './PlanEditor';
import { ExerciseHistorySheet } from './ExerciseHistorySheet';
import { STATUS_ICON, STATUS_LABEL } from './WorkoutLogSheet';

export function SafetyNotice({ compact }: { compact?: boolean }) {
  const profile = useProfile();
  const notes = profile?.healthNotes?.trim();
  return (
    <Alert tone="warn" title="Antes de treinar: avaliação profissional">
      {notes && <p>Você informou: <b>{notes}</b>.</p>}
      {compact ? (
        <p className={notes ? 'mt-1' : ''}>Dores, lesões ou inchaço pedem avaliação antes de iniciar ou intensificar exercícios.</p>
      ) : (
        <>
          <p className={notes ? 'mt-1' : ''}>Recomendamos avaliação profissional e adaptação do treino antes de começar, especialmente se houver inchaço em um só lado ou piora recente. Até lá: nada de impacto, corrida ou cargas altas. Interrompa qualquer movimento que cause dor aguda ou piora.</p>
          <p className="mt-1">Falta de ar, dor no peito ou desmaio: ligue <a className="font-bold underline" href="tel:192">192 (SAMU)</a>.</p>
        </>
      )}
    </Alert>
  );
}

export function ClearanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = useToday();
  const save = useSave();
  const [date, setDate] = useState(today);
  const [checked, setChecked] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Iniciar treino físico">
      <div className="space-y-4">
        <SafetyNotice compact />
        <div className="space-y-3 rounded-xl border border-line p-3">
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--accent)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span>Confirmo que já recebi orientação/liberação profissional adequada para treinar com as adaptações necessárias.</span>
          </label>
          <Field label="Data da liberação">{(id) => <TextInput id={id} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Button className="w-full" disabled={!checked} onClick={async () => {
            const ok = await save(() => updateProfile({ medicalClearanceConfirmed: true, medicalClearanceDate: date, planningOnly: false }).then(() => true), 'Liberação registrada');
            if (ok) onClose();
          }}>Confirmar liberação</Button>
        </div>
        <Button variant="secondary" className="w-full" onClick={async () => {
          const ok = await save(() => updateProfile({ medicalClearanceConfirmed: false, medicalClearanceDate: undefined, planningOnly: true }).then(() => true), 'Ok: só o planejamento será registrado');
          if (ok) onClose();
        }}>Ainda não — registrar só o planejamento</Button>
      </div>
    </Sheet>
  );
}

/** Inicia a sessão ao vivo; sem liberação, pede confirmação antes. */
export function useStartSession() {
  const profile = useProfile();
  const save = useSave();
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ date: string; plan?: WorkoutPlan } | null>(null);
  const go = async (date: string, plan: WorkoutPlan | undefined, confirmed: boolean) => {
    const id = await save(() => startLiveSession({ date, planId: plan?.id, confirmedWithoutClearance: confirmed }), 'Sessão iniciada');
    if (id) navigate('/treinos/sessao');
  };
  const start = (date: string, plan?: WorkoutPlan) => {
    if (plan?.requiresClearance && !profile?.medicalClearanceConfirmed) setPending({ date, plan });
    else void go(date, plan, false);
  };
  const dialog = (
    <ConfirmDialog open={!!pending} title="Iniciar sem liberação confirmada?" confirmLabel="Iniciar mesmo assim"
      onCancel={() => setPending(null)} onConfirm={() => { const p = pending; setPending(null); if (p) void go(p.date, p.plan, true); }}>
      <p>Este treino exige orientação profissional prévia{profile?.healthNotes ? ` (${profile.healthNotes})` : ''}, que ainda não foi confirmada.</p>
      <p className="text-sm text-muted">A sessão ficará marcada como “sem liberação confirmada”. Evite impacto, corrida e cargas altas; interrompa qualquer movimento com dor.</p>
    </ConfirmDialog>
  );
  return { start, dialog };
}

const STATUS_COLOR: Record<string, string> = { completed: 'bg-accent text-accent-fg', partial: 'bg-accent-soft text-accent', postponed: 'bg-card2 text-muted', cancelled: 'bg-card2 text-muted', not_cleared: 'bg-warn-soft text-warn', planned: 'bg-card2' };

function MonthCalendar({ today, plans, sessions, cleared }: { today: string; plans: WorkoutPlan[]; sessions: WorkoutSession[]; cleared: boolean }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const grid = monthGrid(y, m);
  const shift = (d: number) => { const nm = m + d; const ny = y + Math.floor((nm - 1) / 12); const mm = ((nm - 1) % 12 + 12) % 12 + 1; setYm(`${ny}-${String(mm).padStart(2, '0')}`); };
  return (
    <Card title="Calendário de treinos" action={<div className="flex items-center gap-1"><Button variant="ghost" className="!min-h-9 !px-2" aria-label="Mês anterior" onClick={() => shift(-1)}>‹</Button><span className="text-sm first-letter:uppercase">{monthLabel(ym)}</span><Button variant="ghost" className="!min-h-9 !px-2" aria-label="Próximo mês" onClick={() => shift(1)}>›</Button></div>}>
      <div role="grid" aria-label={`Treinos de ${monthLabel(ym)}`} className="grid grid-cols-7 gap-1 text-center text-xs">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <div key={i} className="pb-1 text-muted" aria-hidden>{d}</div>)}
        {grid.flat().map((d, i) => {
          if (!d) return <div key={i} />;
          const done = sessions.filter((s) => s.date === d && !s.inProgress);
          const plan = plans.find((p) => p.weekday === weekday(d) && p.type !== 'rest');
          const best = done.find((s) => s.status === 'completed') ?? done.find((s) => s.status === 'partial') ?? done[0];
          const label = best ? STATUS_LABEL[best.status] : plan ? (d < today ? 'sem registro' : plan.requiresClearance && !cleared ? 'planejado (não liberado)' : 'planejado') : 'livre';
          return (
            <div key={d} role="gridcell" aria-label={`${formatBR(d)}: ${label}`}
              className={cx('flex aspect-square flex-col items-center justify-center rounded-lg border', d === today ? 'border-accent' : 'border-transparent', best ? STATUS_COLOR[best.status] : 'bg-card2/40')}>
              <span className="num">{Number(d.slice(8))}</span>
              <span aria-hidden className="text-[10px] leading-none">{best ? STATUS_ICON[best.status] : plan ? (d < today ? '·' : '○') : ''}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">✔ concluído · ◐ parcial · ⛔ não liberado · ↷ adiado · ○ planejado · “·” dia planejado sem registro</p>
    </Card>
  );
}

function PainMarkers({ entries }: { entries: RecoveryEntry[] }) {
  const { open } = useSheets();
  const cols: [keyof RecoveryEntry, string][] = [['painRightKnee0to10', 'J. dir.'], ['painLeftKnee0to10', 'J. esq.'], ['painShoulder0to10', 'Ombro'], ['painLeftAnkle0to10', 'Tornoz.']];
  return (
    <Card title="Marcadores de dor (0–10)" action={<Button variant="ghost" onClick={() => open({ kind: 'recovery' })}>+ Como estou</Button>}>
      {entries.length === 0 ? <EmptyState icon="🩹">Registre em “Como estou hoje” para acompanhar dor e inchaço ao longo dos dias.</EmptyState> : (
        <table className="w-full text-center text-sm">
          <caption className="sr-only">Dor registrada por dia</caption>
          <thead><tr className="text-xs text-muted"><th className="py-1 text-left font-medium">Dia</th>{cols.map(([, l]) => <th key={l} className="py-1 font-medium">{l}</th>)}<th className="py-1 font-medium">Inchaço</th></tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="py-1.5 text-left"><button type="button" className="text-accent" onClick={() => open({ kind: 'recovery', entry: e })}>{formatShortBR(e.date)}</button></td>
                {cols.map(([k]) => { const v = e[k] as number | undefined; return <td key={k} className={cx('num py-1.5', (v ?? 0) >= 7 ? 'font-bold text-warn' : '')}>{v ?? '—'}</td>; })}
                <td className="py-1.5">{e.leftAnkleSwollen ? `sim${e.ankleSwellingIntensity1to5 ? ` (${e.ankleSwellingIntensity1to5}/5)` : ''}` : e.leftAnkleSwollen === false ? 'não' : '—'}{e.urgentSymptoms && ' 🚨'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-2 text-xs text-muted">Sem diagnóstico. Se os sintomas piorarem, procure o profissional responsável.</p>
    </Card>
  );
}

export function Workouts() {
  const today = useToday();
  const profile = useProfile();
  const { open } = useSheets();
  const save = useSave();
  const navigate = useNavigate();
  const { start, dialog } = useStartSession();
  const [clearOpen, setClearOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkoutPlan | 'new' | null>(null);
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const plans = useLiveQuery(() => db.workoutPlans.toArray().then((p) => p.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.order - b.order)), [], [] as WorkoutPlan[]);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.workouts.orderBy('date').reverse().toArray(), [], [] as WorkoutSession[]);
  const setCounts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    (await db.exerciseSets.toArray()).forEach((s) => m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1));
    return m;
  }, []);
  const library = useLiveQuery(async () => {
    const m = new Map<string, number>();
    (await db.exercises.toArray()).forEach((e) => { if (!m.has(e.name)) m.set(e.name, 0); });
    (await db.exerciseSets.toArray()).forEach((e) => { const k = [...m.keys()].find((x) => x.toLowerCase() === e.exerciseName.toLowerCase()) ?? e.exerciseName; m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [], [] as [string, number][]);
  const recovery = useLiveQuery(() => db.recovery.orderBy('date').reverse().limit(10).toArray(), [], [] as RecoveryEntry[]);
  const cleared = !!profile?.medicalClearanceConfirmed;
  const active = sessions.find((s) => s.inProgress);
  const ws = weekStartMonday(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const cardioWeek = weeklyCardioMinutes(sessions, today);
  const finished = sessions.filter((s) => !s.inProgress);

  return (
    <Page title="Treinos" subtitle={cleared ? `Liberação registrada em ${formatBR(profile?.medicalClearanceDate)}` : 'Planejamento — sessões não liberadas'}>
      {active && (
        <button type="button" onClick={() => navigate('/treinos/sessao')} className="flex w-full items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-left text-accent-fg">
          <span><span className="block text-xs font-semibold uppercase tracking-wide">Sessão em andamento</span><span className="block font-bold">{plans.find((p) => p.id === active.planId)?.name ?? 'Treino avulso'}</span></span>
          <span aria-hidden className="text-2xl">›</span>
        </button>
      )}
      {!cleared ? <SafetyNotice /> : (
        <Alert tone="info" title="Liberação registrada">Siga as adaptações recebidas. Cargas leves a moderadas, 2–3 repetições “sobrando”, sem buscar falha. Progrida só após duas sessões consecutivas confortáveis.</Alert>
      )}

      <Card title="Situação">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px]">
            {cleared ? '✔ Liberado para treinar (conforme orientação)' : profile?.planningOnly ? '⛔ Só planejamento (não liberado)' : '⛔ Não liberado — aguardando avaliação'}
          </p>
          {cleared
            ? <Button variant="secondary" onClick={() => save(() => updateProfile({ medicalClearanceConfirmed: false, medicalClearanceDate: undefined }), 'Liberação removida')}>Remover</Button>
            : <Button onClick={() => setClearOpen(true)}>Iniciar treino físico</Button>}
        </div>
      </Card>

      <Card title="Esta semana" action={<Button variant="ghost" onClick={() => open({ kind: 'workout' })}>+ Registro rápido</Button>}>
        <ul className="divide-y divide-line">
          {week.map((d) => {
            const plan = plans.find((p) => p.weekday === weekday(d));
            const done = sessions.filter((s) => s.date === d && !s.inProgress);
            const isToday = d === today;
            return (
              <li key={d} className={cx('flex gap-3 py-2.5', isToday && 'font-semibold')}>
                <span className={cx('num w-12 shrink-0 pt-0.5 text-sm leading-tight', isToday ? 'text-accent' : 'text-muted')}>{weekdayShort(weekday(d))}<br />{formatShortBR(d)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{plan?.name ?? 'Livre'}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-xs font-normal text-muted">
                      {done.length ? done.map((s) => `${STATUS_ICON[s.status]} ${STATUS_LABEL[s.status]}${s.confirmedWithoutClearance ? ' (sem liberação)' : ''}`).join(' · ')
                        : plan?.type === 'rest' ? 'Descanso' : plan?.requiresClearance && !cleared ? '⛔ Planejado / não liberado' : '○ Planejado'}
                    </span>
                    {plan && plan.type !== 'rest' && (
                      <span className="ml-auto flex shrink-0 gap-1">
                        {d <= today && !active && <Button variant="secondary" className="!min-h-9 !px-3 text-sm" onClick={() => start(d, plan)} aria-label={`Iniciar ${plan.name} em ${formatBR(d)}`}>▶ Iniciar</Button>}
                        <button type="button" className="min-h-9 rounded-lg px-2 text-sm text-accent hover:bg-accent-soft" onClick={() => open({ kind: 'workout', date: d, planId: plan.id })}
                          aria-label={`Registrar ${plan.name} em ${formatBR(d)}`}>Registrar</button>
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {!active && <Button variant="ghost" className="mt-2 w-full" onClick={() => start(today)}>▶ Iniciar treino avulso</Button>}
      </Card>

      <Card title="Cardio da semana">
        <p className="num text-2xl font-bold">{cardioWeek} <span className="text-sm font-medium text-muted">min de 150 min (referência)</span></p>
        <div className="mt-2"><ProgressBar label="Cardio da semana" value={cardioWeek} max={150} valueText={`${cardioWeek} de 150 minutos`} /></div>
        <p className="mt-2 text-xs text-muted">Progredir aos poucos até 150 min/semana de cardio moderado, se tolerado e liberado. Baixo impacto.</p>
      </Card>

      <MonthCalendar today={today} plans={plans} sessions={sessions} cleared={cleared} />

      <Card title="Plano semanal" action={<Button variant="ghost" onClick={() => setEditing('new')}>+ Novo treino</Button>}>
        <ul className="space-y-2">
          {plans.map((p) => {
            const ex = exercises.filter((e) => e.workoutPlanId === p.id).sort((a, b) => a.order - b.order);
            const isOpen = expanded === p.id;
            return (
              <li key={p.id} className="rounded-xl border border-line">
                <button type="button" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : p.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                  <span className="min-w-0">
                    <span className="block text-xs uppercase tracking-wide text-muted">{weekdayName(p.weekday)}{p.durationLabel ? ` · ${p.durationLabel}` : ''}</span>
                    <span className="block font-medium">{p.name}</span>
                  </span>
                  <span className="shrink-0 text-xs">{p.requiresClearance && !cleared ? <span className="rounded-full bg-warn-soft px-2 py-1 text-warn">não liberado</span> : p.type === 'rest' ? '' : <span className="rounded-full bg-accent-soft px-2 py-1 text-accent">planejado</span>}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-line p-3 text-sm">
                    {p.safetyNote && <p className="mb-2 text-warn">⚠ {p.safetyNote}</p>}
                    {ex.length ? (
                      <ul className="space-y-1">{ex.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2">
                          <button type="button" className="text-left underline decoration-line underline-offset-4" onClick={() => setHistoryOf(e.name)}>{e.name}</button>
                          <span className="num shrink-0 text-muted">{e.targetSets ?? '—'} × {e.targetReps ?? '—'}</span>
                        </li>
                      ))}</ul>
                    ) : <p className="text-muted">{p.type === 'rest' ? 'Dia de descanso.' : 'Modalidade de baixo impacto à escolha (bicicleta, elíptico, caminhada leve no plano), conforme liberação.'}</p>}
                    <Button variant="secondary" className="mt-3 w-full !min-h-9" onClick={() => setEditing(p)}>Editar treino</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Exercícios e evolução">
        {library.length === 0 ? <EmptyState icon="📈">Os exercícios do plano aparecerão aqui.</EmptyState> : (
          <ul className="divide-y divide-line">
            {library.map(([n, count]) => (
              <li key={n}><button type="button" className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm" onClick={() => setHistoryOf(n)}>
                <span>{n}</span><span className="shrink-0 text-xs text-muted">{count ? `${count} série${count > 1 ? 's' : ''} ›` : 'sem registros ›'}</span>
              </button></li>
            ))}
          </ul>
        )}
      </Card>

      <PainMarkers entries={recovery} />

      <Card title="Histórico">
        {finished.length === 0 ? <EmptyState icon="🏋️">Seu primeiro registro de treino aparecerá aqui.</EmptyState> : (
          <ul className="divide-y divide-line">
            {finished.slice(0, 40).map((s) => (
              <li key={s.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 py-2.5 text-left" onClick={() => open({ kind: 'workout', session: s })}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{plans.find((p) => p.id === s.planId)?.name ?? 'Atividade avulsa'}</span>
                    <span className="block text-xs text-muted">{formatBR(s.date)}{s.durationMin ? ` · ${s.durationMin} min` : ''}{setCounts?.get(s.id) ? ` · ${setCounts.get(s.id)} séries` : ''}{s.cardioMinutes ? ` · cardio ${s.cardioMinutes} min${s.cardioModality ? ` (${s.cardioModality})` : ''}` : ''}{s.discomfort ? ` · desconforto: ${s.discomfort}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-xs">{STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ClearanceDialog open={clearOpen} onClose={() => setClearOpen(false)} />
      {editing && <PlanEditor plan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {historyOf && <ExerciseHistorySheet name={historyOf} onClose={() => setHistoryOf(null)} />}
      {dialog}
    </Page>
  );
}
