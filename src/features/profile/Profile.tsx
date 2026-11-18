import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, ConfirmDialog, Field, Page, Select, Stat, TextInput, Toggle } from '../../components/ui';
import { useProfile, useSave, useSettingsOrDefault, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { deleteMilestone, saveMilestone, saveTargets, updateProfile, updateSettings } from '../../data/repo';
import { bmi, bmrMifflinStJeor, fmt, fmtInt, kcalFromMacros, parseDecimal, sortMilestones, targetsForDate, weeksBetween } from '../../domain/calculations';
import { formatBR } from '../../domain/dates';
import { profileFormSchema, targetsFormSchema } from '../../domain/validations';
import type { MealSlot, Sex } from '../../domain/types';
import { BackupCard } from '../backup/Backup';
import { SafetyNotice } from '../workouts/Workouts';

const s = (n?: number) => (n === undefined ? '' : String(n).replace('.', ','));
const n = (v: string) => { const x = parseDecimal(v); return x === null ? undefined : x; };

function ProfileForm() {
  const profile = useProfile();
  const save = useSave();
  const [f, setF] = useState<Record<string, string>>({});
  const [sex, setSex] = useState<Sex>('male');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (profile) {
      setF({ displayName: profile.displayName, age: s(profile.ageAtStart), height: s(profile.heightCm), startDate: profile.startDate, startWeight: s(profile.startWeightKg), goal: s(profile.goalWeightKg), targetDate: profile.targetDate, rate: s(profile.plannedRateKgPerWeek), health: profile.healthNotes ?? '' });
      setSex(profile.sexForBmr);
    }
  }, [profile]);
  if (!profile) return null;
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(null); };
  const weeks = f.startDate && f.targetDate && f.startDate < f.targetDate ? weeksBetween(f.startDate, f.targetDate) : null;
  const sw = n(f.startWeight ?? ''), gw = n(f.goal ?? '');
  const implied = weeks && sw !== undefined && gw !== undefined ? (sw - gw) / weeks : null;

  async function submit() {
    const r = profileFormSchema.safeParse({ displayName: f.displayName, ageAtStart: n(f.age ?? ''), heightCm: n(f.height ?? '') ?? NaN, startDate: f.startDate, startWeightKg: n(f.startWeight ?? '') ?? NaN, goalWeightKg: n(f.goal ?? '') ?? NaN, targetDate: f.targetDate });
    if (!r.success) { setErr(`Verifique: ${r.error.issues[0]?.path.join('.')} — ${r.error.issues[0]?.message}`); return; }
    if (r.data.targetDate <= r.data.startDate) { setErr('A data-alvo deve ser depois da data de início'); return; }
    await save(() => updateProfile({ ...r.data, sexForBmr: sex, plannedRateKgPerWeek: n(f.rate ?? ''), healthNotes: f.health?.trim() || undefined }), 'Perfil salvo');
  }

  return (
    <Card title="Perfil">
      <div className="space-y-3">
        {err && <p role="alert" className="text-sm font-medium text-danger">⚠ {err}</p>}
        <Field label="Nome no app">{(id) => <TextInput id={id} value={f.displayName ?? ''} onChange={set('displayName')} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Idade no início">{(id) => <TextInput id={id} inputMode="numeric" value={f.age ?? ''} onChange={set('age')} />}</Field>
          <Field label="Sexo (cálculo da TMB)">{(id) => <Select id={id} value={sex} onChange={(e) => setSex(e.target.value as Sex)}><option value="male">Masculino</option><option value="female">Feminino</option><option value="unspecified">Não informar</option></Select>}</Field>
          <Field label="Altura (cm)">{(id) => <TextInput id={id} inputMode="decimal" value={f.height ?? ''} onChange={set('height')} />}</Field>
          <Field label="Peso inicial (kg)">{(id) => <TextInput id={id} inputMode="decimal" value={f.startWeight ?? ''} onChange={set('startWeight')} />}</Field>
          <Field label="Data de início">{(id) => <TextInput id={id} type="date" value={f.startDate ?? ''} onChange={set('startDate')} />}</Field>
          <Field label="Objetivo (kg)">{(id) => <TextInput id={id} inputMode="decimal" value={f.goal ?? ''} onChange={set('goal')} />}</Field>
          <Field label="Data-alvo">{(id) => <TextInput id={id} type="date" value={f.targetDate ?? ''} onChange={set('targetDate')} />}</Field>
          <Field label="Ritmo pretendido (kg/sem.)">{(id) => <TextInput id={id} inputMode="decimal" value={f.rate ?? ''} onChange={set('rate')} />}</Field>
        </div>
        {implied !== null && <p className="text-xs text-muted">Ritmo médio implícito pelas datas: {fmt(implied, 2)} kg/semana (referência, não limite).</p>}
        <Field label="Dores, lesões ou condições a considerar" hint="Aparece nos alertas de segurança.">{(id) => <textarea id={id} rows={2} className="w-full rounded-xl border border-line bg-card2 p-3" value={f.health ?? ''} onChange={(e) => { setF((x) => ({ ...x, health: e.target.value })); setErr(null); }} />}</Field>
        <p className="text-xs text-muted">O objetivo é um marco, não garantia de um visual específico. Imagens de objetivo são referências artísticas.</p>
        <Button className="w-full" onClick={submit}>Salvar perfil</Button>
      </div>
    </Card>
  );
}

function Indicators() {
  const profile = useProfile();
  if (!profile) return null;
  const b = bmi(profile.startWeightKg, profile.heightCm);
  const tmb = bmrMifflinStJeor({ weightKg: profile.startWeightKg, heightCm: profile.heightCm, age: profile.ageAtStart, sex: profile.sexForBmr });
  return (
    <Card title="Indicadores iniciais (estimativas)">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="IMC inicial" value={fmt(b)} sub={`${fmt(profile.startWeightKg)} / ${fmt(profile.heightCm / 100, 2)}²`} />
        <Stat label="TMB estimada" value={tmb ? fmtInt(tmb) : '—'} unit={tmb ? 'kcal/dia' : undefined} sub="Mifflin-St Jeor" />
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
        <li>IMC não mede composição corporal (músculo × gordura).</li>
        <li>TMB = 10×peso + 6,25×altura − 5×idade {profile.sexForBmr === 'male' ? '+ 5' : profile.sexForBmr === 'female' ? '− 161' : '(requer sexo informado)'}. É estimativa, não diagnóstico.</li>
        <li>Gasto total diário depende muito da atividade; qualquer número é hipótese, não medida comprovada.</li>
        <li>O app não mostra % de gordura sem medição real informada por você.</li>
      </ul>
    </Card>
  );
}

function TargetsForm() {
  const today = useToday();
  const all = useLiveQuery(() => db.targets.toArray(), []) ?? [];
  const cur = targetsForDate(all, today);
  const save = useSave();
  const [f, setF] = useState<Record<string, string>>({});
  const [eff, setEff] = useState(today);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (cur) setF({ k: s(cur.caloriesKcal), p: s(cur.proteinG), c: s(cur.carbsG), g: s(cur.fatG), wmin: s(cur.waterMinMl), wmax: s(cur.waterMaxMl) }); }, [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(null); };
  const mk = n(f.p ?? '') !== undefined && n(f.c ?? '') !== undefined && n(f.g ?? '') !== undefined ? kcalFromMacros(n(f.p!)!, n(f.c!)!, n(f.g!)!) : null;
  const parsed = targetsFormSchema.safeParse({ caloriesKcal: n(f.k ?? '') ?? NaN, proteinG: n(f.p ?? '') ?? NaN, carbsG: n(f.c ?? '') ?? NaN, fatG: n(f.g ?? '') ?? NaN, waterMinMl: n(f.wmin ?? '') ?? NaN, waterMaxMl: n(f.wmax ?? '') ?? NaN });
  const changed = cur && parsed.success && (parsed.data.caloriesKcal !== cur.caloriesKcal || parsed.data.proteinG !== cur.proteinG || parsed.data.carbsG !== cur.carbsG || parsed.data.fatG !== cur.fatG || parsed.data.waterMinMl !== cur.waterMinMl || parsed.data.waterMaxMl !== cur.waterMaxMl);
  const history = [...all].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  return (
    <Card title="Metas nutricionais">
      <div className="space-y-3">
        {err && <p role="alert" className="text-sm font-medium text-danger">⚠ {err}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Energia (kcal/dia)">{(id) => <TextInput id={id} inputMode="numeric" value={f.k ?? ''} onChange={set('k')} />}</Field>
          <Field label="Proteína (g)">{(id) => <TextInput id={id} inputMode="numeric" value={f.p ?? ''} onChange={set('p')} />}</Field>
          <Field label="Carboidrato (g)">{(id) => <TextInput id={id} inputMode="numeric" value={f.c ?? ''} onChange={set('c')} />}</Field>
          <Field label="Gordura (g)">{(id) => <TextInput id={id} inputMode="numeric" value={f.g ?? ''} onChange={set('g')} />}</Field>
          <Field label="Água – mínimo (ml)">{(id) => <TextInput id={id} inputMode="numeric" value={f.wmin ?? ''} onChange={set('wmin')} />}</Field>
          <Field label="Água – máximo (ml)">{(id) => <TextInput id={id} inputMode="numeric" value={f.wmax ?? ''} onChange={set('wmax')} />}</Field>
        </div>
        {mk !== null && (
          <p className="num text-sm">Conferência: {fmtInt(n(f.p!))}×4 + {fmtInt(n(f.c!))}×4 + {fmtInt(n(f.g!))}×9 = <b>{fmtInt(mk)} kcal</b>
            {n(f.k ?? '') !== undefined && Math.abs(mk - n(f.k!)!) > 25 && <span className="text-warn"> · difere da meta de {fmtInt(n(f.k!))} kcal</span>}</p>
        )}
        <Field label="Vale a partir de" hint="Dias anteriores mantêm a meta que estava vigente.">{(id) => <TextInput id={id} type="date" value={eff} onChange={(e) => setEff(e.target.value)} />}</Field>
        <Button className="w-full" disabled={!changed} onClick={() => { if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Valores inválidos'); return; } setConfirm(true); }}>
          {changed ? 'Salvar novas metas' : 'Sem alterações'}
        </Button>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Histórico de metas ({history.length})</summary>
          <ul className="mt-2 space-y-1">
            {history.map((t) => <li key={t.id} className="num text-xs text-muted">Desde {formatBR(t.effectiveDate)}: {fmtInt(t.caloriesKcal)} kcal · P {fmtInt(t.proteinG)} · C {fmtInt(t.carbsG)} · G {fmtInt(t.fatG)} · água {fmtInt(t.waterMinMl)}–{fmtInt(t.waterMaxMl)} ml</li>)}
          </ul>
        </details>
      </div>
      <ConfirmDialog open={confirm} title="Alterar metas nutricionais?" confirmLabel="Confirmar alteração" onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          if (!parsed.success) return;
          const ok = await save(() => saveTargets({ effectiveDate: eff, ...parsed.data }).then(() => true), 'Novas metas salvas');
          if (ok) setConfirm(false);
        }}>
        {parsed.success && cur && <p className="num">De {fmtInt(cur.caloriesKcal)} kcal (P {fmtInt(cur.proteinG)}/C {fmtInt(cur.carbsG)}/G {fmtInt(cur.fatG)}) para <b>{fmtInt(parsed.data.caloriesKcal)} kcal</b> (P {fmtInt(parsed.data.proteinG)}/C {fmtInt(parsed.data.carbsG)}/G {fmtInt(parsed.data.fatG)}), a partir de {formatBR(eff)}.</p>}
        <p className="text-sm text-muted">Mudanças de calorias idealmente são discutidas com um profissional de nutrição.</p>
      </ConfirmDialog>
    </Card>
  );
}

function MilestonesEditor() {
  const ms = sortMilestones(useLiveQuery(() => db.milestones.toArray(), []) ?? []);
  const save = useSave();
  const [date, setDate] = useState('');
  const [w, setW] = useState('');
  return (
    <Card title="Cronograma de marcos">
      <ul className="divide-y divide-line">
        {ms.map((m) => (
          <li key={`${m.id}-${m.date}-${m.targetWeightKg}`} className="flex items-center gap-2 py-2">
            <TextInput type="date" aria-label="Data do marco" defaultValue={m.date} className="flex-1"
              onBlur={(e) => e.target.value && e.target.value !== m.date && save(() => saveMilestone({ ...m, date: e.target.value, status: m.status === 'pending' ? 'rescheduled' : m.status }), 'Marco remarcado')} />
            <TextInput inputMode="decimal" aria-label={`Peso-meta de ${formatBR(m.date)}`} defaultValue={s(m.targetWeightKg)} className="w-24 text-right num"
              onBlur={(e) => { const v = n(e.target.value); if (v && v !== m.targetWeightKg && v > 30 && v < 350) void save(() => saveMilestone({ ...m, targetWeightKg: v }), 'Marco atualizado'); }} />
            <button type="button" className="min-h-11 px-2 text-danger" aria-label={`Excluir marco de ${formatBR(m.date)}`} onClick={() => save(() => deleteMilestone(m.id), 'Marco excluído')}>✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-end gap-2">
        <Field label="Nova data" className="flex-1">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="kg" className="w-24">{(id) => <TextInput id={id} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />}</Field>
        <Button variant="secondary" onClick={async () => { const v = n(w); if (!date || !v) return; await save(() => saveMilestone({ date, targetWeightKg: v, status: 'pending' }), 'Marco adicionado'); setDate(''); setW(''); }}>Adicionar</Button>
      </div>
      <p className="mt-2 text-xs text-muted">A linha de metas do gráfico é interpolada entre estes marcos. Referência média: 0,4–0,5 kg/semana.</p>
    </Card>
  );
}

function MealsEditor() {
  const settings = useSettingsOrDefault();
  const save = useSave();
  const [meals, setMeals] = useState<MealSlot[]>(settings.meals);
  const [prefs, setPrefs] = useState(settings.foodPreferences);
  useEffect(() => { setMeals(settings.meals); setPrefs(settings.foodPreferences); }, [settings.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (i: number, patch: Partial<MealSlot>) => setMeals((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Card title="Refeições, horários e preferências">
      <ul className="space-y-3">
        {meals.map((m, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex gap-2">
              <TextInput aria-label="Nome da refeição" value={m.label} onChange={(e) => upd(i, { label: e.target.value })} className="flex-1" />
              <TextInput aria-label="Horário" type="time" value={m.time} onChange={(e) => upd(i, { time: e.target.value })} className="w-28" />
              <button type="button" className="min-h-11 px-2 text-danger" aria-label={`Remover ${m.label}`} onClick={() => setMeals((x) => x.filter((_, j) => j !== i))}>✕</button>
            </div>
            <TextInput aria-label="Refeição de referência" value={m.reference ?? ''} onChange={(e) => upd(i, { reference: e.target.value })} placeholder="Referência (opcional)" />
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="mt-2 w-full" onClick={() => setMeals((m) => [...m, { label: 'Nova refeição', time: '10:00' }])}>+ Refeição</Button>
      <Field label="Preferências alimentares" className="mt-3">{(id) => <textarea id={id} rows={3} className="w-full rounded-xl border border-line bg-card2 p-3" value={prefs} onChange={(e) => setPrefs(e.target.value)} />}</Field>
      <p className="mt-2 text-xs text-muted">A lista de referência organiza o dia; não é tabela nutricional validada e não fecha exatamente com as metas.</p>
      <Button className="mt-3 w-full" onClick={() => {
        const clean = meals.filter((m) => m.label.trim()).map((m) => ({ ...m, label: m.label.trim() }));
        if (new Set(clean.map((m) => m.label)).size !== clean.length) { void save(() => Promise.reject(new Error('Há refeições com o mesmo nome'))); return; }
        void save(() => updateSettings({ meals: clean, foodPreferences: prefs }), 'Refeições salvas');
      }}>Salvar refeições</Button>
    </Card>
  );
}

function PreferencesCard() {
  const settings = useSettingsOrDefault();
  const save = useSave();
  const [pause, setPause] = useState(false);
  const set = (patch: Parameters<typeof updateSettings>[0], msg = 'Preferência salva') => save(() => updateSettings(patch), msg);
  return (
    <Card title="Painel e aparência">
      <div className="divide-y divide-line">
        <Toggle label="Mostrar peso no painel" checked={settings.showWeight} onChange={(v) => set({ showWeight: v })} />
        <Toggle label="Mostrar calorias no painel" checked={settings.showCalories} onChange={(v) => set({ showCalories: v })} />
        <Toggle label="Mostrar treinos no painel" checked={settings.showWorkouts} onChange={(v) => set({ showWorkouts: v })} />
        <Toggle label="Fotos de progresso" description="Fase 3 — preferência guardada" checked={settings.showPhotos} onChange={(v) => set({ showPhotos: v })} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Tema">{(id) => <Select id={id} value={settings.theme} onChange={(e) => set({ theme: e.target.value as 'dark' })}><option value="dark">Grafite escuro</option><option value="light">Claro</option><option value="system">Automático</option></Select>}</Field>
        <Field label="Cor de destaque">{(id) => <Select id={id} value={settings.accent} onChange={(e) => set({ accent: e.target.value as 'green' })}><option value="green">Verde</option><option value="blue">Azul</option></Select>}</Field>
        <Field label="Fuso horário" className="col-span-2" hint="Define a data de “hoje” e o início das semanas (segunda-feira).">{(id) => (
          <Select id={id} value={settings.timeZone} onChange={(e) => set({ timeZone: e.target.value })}>
            {['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Noronha', 'America/Rio_Branco', 'America/Denver', 'America/New_York', 'America/Los_Angeles', 'Europe/Lisbon'].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
          </Select>
        )}</Field>
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <Toggle label="Pausar acompanhamento" description="Esconde cobranças do painel; o histórico é mantido." checked={settings.trackingPaused}
          onChange={(v) => (v ? setPause(true) : set({ trackingPaused: false }, 'Acompanhamento retomado'))} />
      </div>
      <ConfirmDialog open={pause} title="Pausar acompanhamento?" confirmLabel="Pausar" onCancel={() => setPause(false)} onConfirm={async () => { await set({ trackingPaused: true }, 'Acompanhamento pausado'); setPause(false); }}>
        <p>Nada é apagado. Você pode retomar a qualquer momento.</p>
      </ConfirmDialog>
    </Card>
  );
}

export function Profile() {
  return (
    <Page title="Perfil e plano" subtitle="Tudo editável — dados ficam no aparelho">
      <ProfileForm />
      <Indicators />
      <TargetsForm />
      <MilestonesEditor />
      <MealsEditor />
      <PreferencesCard />
      <Card title="Lembretes">
        <p className="text-sm">Nesta versão, os lembretes aparecem <b>dentro do app</b> (cartão “Ainda falta registrar hoje” e aviso do dia 17). Notificações push no iPhone exigiriam um servidor e não foram ativadas — nada é prometido que não funcione.</p>
      </Card>
      <BackupCard />
      <Card title="Segurança">
        <SafetyNotice compact />
        <p className="mt-3 text-sm"><Link className="font-semibold text-accent" to="/treinos">Ver situação de liberação dos treinos ›</Link></p>
      </Card>
      <Alert tone="info" title="Privacidade">Sem login, sem servidor, sem analytics. Nenhum dado de saúde ou foto é enviado para a internet. O app não diagnostica nem promete resultados.</Alert>
      <p className="pb-2 text-center text-xs text-muted">Corpo Atlético 2027 · v1.0 (Fase 1)</p>
    </Page>
  );
}
