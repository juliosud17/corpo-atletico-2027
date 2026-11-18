import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { planLinePoints, weeklyAverages } from '../../domain/calculations';
import { addDays } from '../../domain/dates';
import { formatBR, formatShortBR, fromDayNumber, toDayNumber } from '../../domain/dates';
import type { GoalMilestone, ISODate, WeightEntry } from '../../domain/types';

interface Props { weights: WeightEntry[]; milestones: GoalMilestone[]; from: ISODate; to: ISODate; height?: number; compact?: boolean; showWeekly?: boolean }

const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function WeightChart({ weights, milestones, from, to, height = 220, compact, showWeekly }: Props) {
  const real = weights
    .filter((w) => w.date >= from && w.date <= to)
    .map((w) => ({ day: toDayNumber(w.date) + (w.time ? (+w.time.slice(0, 2) * 60 + +w.time.slice(3, 5)) / 1440 : 0.3), real: w.weightKg, date: w.date }))
    .sort((a, b) => a.day - b.day);
  const plan = planLinePoints(milestones, from, to);
  // Média semanal plotada no meio da semana (quinta-feira).
  const weekly = showWeekly ? weeklyAverages(weights).map((w) => ({ day: toDayNumber(addDays(w.weekStart, 3)), weekly: w.averageKg, count: w.count })).filter((w) => w.day >= toDayNumber(from) && w.day <= toDayNumber(to)) : [];
  const all = [...real.map((r) => r.real), ...plan.map((p) => p.plan)];
  const min = all.length ? Math.floor(Math.min(...all) - 1) : 90;
  const max = all.length ? Math.ceil(Math.max(...all) + 1) : 115;
  const x0 = toDayNumber(from), x1 = toDayNumber(to);
  const span = x1 - x0;
  const tickCount = compact ? 3 : 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round(x0 + (span * i) / (tickCount - 1)));

  return (
    <figure className="m-0">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="0" vertical={false} />
            <XAxis type="number" dataKey="day" domain={[x0, x1]} ticks={ticks} allowDuplicatedCategory={false}
              tickFormatter={(d: number) => formatShortBR(fromDayNumber(Math.floor(d)))} stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
            <YAxis domain={[min, max]} allowDecimals={false} tickCount={5} stroke="var(--muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={34} tickFormatter={(v: number) => Math.round(v).toLocaleString('pt-BR')} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--fg)', fontSize: 13 }}
              labelFormatter={(d) => formatBR(fromDayNumber(Math.floor(Number(d))))}
              formatter={(v, name) => [`${fmt1(Number(v))} kg`, name === 'real' ? 'Registrado' : name === 'weekly' ? 'Média semanal' : 'Meta de referência']} />
            <Line data={plan} dataKey="plan" name="plan" type="linear" stroke="var(--plan)" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={false} />
            {showWeekly && <Line data={weekly} dataKey="weekly" name="weekly" type="linear" stroke="var(--fg)" strokeOpacity={0.55} strokeWidth={2} dot={{ r: 3, fill: 'var(--card)', stroke: 'var(--fg)', strokeOpacity: 0.55, strokeWidth: 2 }} isAnimationActive={false} />}
            <Line data={real} dataKey="real" name="real" type="linear" stroke="var(--accent)" strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--card)', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        {real.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-muted">Sem dados registrados</span>
          </div>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="0" y1="5" x2="22" y2="5" stroke="var(--accent)" strokeWidth="2.5" /><circle cx="11" cy="5" r="3.5" fill="var(--accent)" /></svg>Peso registrado</span>
        <span className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="0" y1="5" x2="22" y2="5" stroke="var(--plan)" strokeWidth="2" strokeDasharray="5 4" /></svg>Meta de referência (interpolada)</span>
        {showWeekly && <span className="flex items-center gap-1.5"><svg width="22" height="10" aria-hidden><line x1="0" y1="5" x2="22" y2="5" stroke="var(--fg)" strokeOpacity="0.55" strokeWidth="2" /><circle cx="11" cy="5" r="3" fill="var(--card)" stroke="var(--fg)" strokeOpacity="0.55" strokeWidth="2" /></svg>Média semanal</span>}
      </figcaption>
    </figure>
  );
}
