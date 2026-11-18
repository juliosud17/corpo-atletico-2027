import { useLiveQuery } from 'dexie-react-hooks';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, Sheet } from '../../components/ui';
import { db } from '../../data/db';
import { fmt } from '../../domain/calculations';
import { formatBR, formatShortBR } from '../../domain/dates';
import { exerciseHistory, normalizeName, progressionSuggestion } from '../../domain/workouts';
import type { ExerciseSet, WorkoutSession } from '../../domain/types';
import { ProgressionBadge } from './LiveSession';

export function ExerciseHistorySheet({ name, onClose }: { name: string; onClose: () => void }) {
  const sets = useLiveQuery(() => db.exerciseSets.toArray(), [], [] as ExerciseSet[]);
  const sessions = useLiveQuery(() => db.workouts.toArray(), [], [] as WorkoutSession[]);
  const prescription = useLiveQuery(() => db.exercises.filter((e) => normalizeName(e.name) === normalizeName(name)).first(), [name]);
  const history = exerciseHistory(name, sets, sessions.filter((s) => !s.inProgress));
  const hasLoad = history.some((h) => h.maxLoadKg !== null);
  const data = history.map((h) => ({ date: h.date, label: formatShortBR(h.date), value: hasLoad ? h.maxLoadKg : h.totalReps }));
  const prog = progressionSuggestion(history, prescription ?? {});

  return (
    <Sheet open onClose={onClose} title={name}>
      {history.length === 0 ? <EmptyState icon="🏋️">Nenhuma série registrada deste exercício ainda.</EmptyState> : (
        <div className="space-y-4">
          <ProgressionBadge kind={prog.kind} reason={prog.reason} />
          <figure className="m-0">
            <figcaption className="mb-1 text-sm font-semibold">{hasLoad ? 'Carga máxima por sessão (kg)' : 'Repetições totais por sessão'}</figcaption>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} allowDecimals={false} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)', fontSize: 13 }}
                    formatter={(v) => [hasLoad ? `${fmt(Number(v))} kg` : `${v} reps`, hasLoad ? 'Carga máxima' : 'Repetições']} />
                  <Line dataKey="value" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <table className="w-full text-sm">
            <caption className="sr-only">Histórico de {name}</caption>
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium">Data</th><th className="py-1 font-medium">Reps por série</th><th className="py-1 text-right font-medium">Carga máx.</th></tr></thead>
            <tbody>
              {[...history].reverse().map((h) => (
                <tr key={h.sessionId} className="border-t border-line">
                  <td className="py-2">{formatBR(h.date)}</td>
                  <td className="num py-2">{h.repsPerSet.join(' / ')}{h.maxRpe !== null && <span className="text-muted"> · RPE ≤{h.maxRpe}</span>}{h.anyPain && <span className="text-warn"> · dor</span>}</td>
                  <td className="num py-2 text-right">{h.maxLoadKg !== null ? `${fmt(h.maxLoadKg)} kg` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Sheet>
  );
}
