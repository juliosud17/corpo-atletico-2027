import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Alert, Button, Card, EmptyState, Field, Page, Sheet, TextInput, cx } from '../../components/ui';
import { useProfile, useSave, useToday } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { updateProfile } from '../../data/repo';
import { addDays, formatBR, formatShortBR, weekStartMonday, weekday, weekdayName, weekdayShort } from '../../domain/dates';
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

export function Workouts() {
  const today = useToday();
  const profile = useProfile();
  const { open } = useSheets();
  const save = useSave();
  const [clearOpen, setClearOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const plans = useLiveQuery(() => db.workoutPlans.orderBy('order').toArray(), []) ?? [];
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.workouts.orderBy('date').reverse().toArray(), []) ?? [];
  const cleared = !!profile?.medicalClearanceConfirmed;
  const ws = weekStartMonday(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(ws, i));

  return (
    <Page title="Treinos" subtitle={cleared ? `Liberação registrada em ${formatBR(profile?.medicalClearanceDate)}` : 'Planejamento — sessões não liberadas'}>
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

      <Card title="Esta semana" action={<Button variant="ghost" onClick={() => open({ kind: 'workout' })}>+ Registrar</Button>}>
        <ul className="divide-y divide-line">
          {week.map((d) => {
            const plan = plans.find((p) => p.weekday === weekday(d));
            const done = sessions.filter((s) => s.date === d);
            const isToday = d === today;
            return (
              <li key={d} className={cx('flex items-center gap-3 py-2.5', isToday && 'font-semibold')}>
                <span className={cx('num w-14 shrink-0 text-sm', isToday ? 'text-accent' : 'text-muted')}>{weekdayShort(weekday(d))} {formatShortBR(d)}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate">{plan?.name ?? 'Livre'}</span>
                  <span className="block text-xs font-normal text-muted">
                    {done.length ? done.map((s) => `${STATUS_ICON[s.status]} ${STATUS_LABEL[s.status]}${s.confirmedWithoutClearance ? ' (sem liberação)' : ''}`).join(' · ')
                      : plan?.type === 'rest' ? 'Descanso' : plan?.requiresClearance && !cleared ? '⛔ Planejado / não liberado' : '○ Planejado'}
                  </span>
                </span>
                {plan && plan.type !== 'rest' && (
                  <button type="button" className="min-h-10 shrink-0 rounded-lg px-2 text-sm text-accent hover:bg-accent-soft" onClick={() => open({ kind: 'workout', date: d, planId: plan.id })}
                    aria-label={`Registrar ${plan.name} em ${formatBR(d)}`}>Registrar</button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Semana de referência (quando houver liberação)">
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
                      <ul className="space-y-1">{ex.map((e) => <li key={e.id} className="flex justify-between gap-2"><span>{e.name}</span><span className="num text-muted">{e.targetSets ?? '—'} × {e.targetReps ?? '—'}</span></li>)}</ul>
                    ) : <p className="text-muted">{p.type === 'rest' ? 'Dia de descanso.' : 'Modalidade de baixo impacto à escolha (bicicleta, elíptico, caminhada leve no plano), conforme liberação.'}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Edição de exercícios, séries/cargas, cronômetro e histórico por exercício: Fase 2.</p>
      </Card>

      <Card title="Histórico">
        {sessions.length === 0 ? <EmptyState icon="🏋️">Seu primeiro registro de treino aparecerá aqui.</EmptyState> : (
          <ul className="divide-y divide-line">
            {sessions.slice(0, 30).map((s) => (
              <li key={s.id}>
                <button type="button" className="flex w-full items-center justify-between gap-2 py-2.5 text-left" onClick={() => open({ kind: 'workout', session: s })}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{plans.find((p) => p.id === s.planId)?.name ?? 'Atividade avulsa'}</span>
                    <span className="block text-xs text-muted">{formatBR(s.date)}{s.durationMin ? ` · ${s.durationMin} min` : ''}{s.discomfort ? ` · desconforto: ${s.discomfort}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-xs">{STATUS_ICON[s.status]} {STATUS_LABEL[s.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ClearanceDialog open={clearOpen} onClose={() => setClearOpen(false)} />
    </Page>
  );
}
