import { useRef, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, Field, Select, TextInput, Toggle, useToast } from '../../components/ui';
import { useSave } from '../../app/hooks';
import { completeOnboarding, importBackup } from '../../data/repo';
import { parseDecimal } from '../../domain/calculations';
import { addDays, todayISO } from '../../domain/dates';
import { backupCounts, profileFormSchema, validateBackup } from '../../domain/validations';
import type { BackupFile, Sex } from '../../domain/types';

export function Onboarding() {
  const save = useSave();
  const { show: toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [restore, setRestore] = useState<BackupFile | null>(null);
  const [step, setStep] = useState(0);
  const today = todayISO();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('unspecified');
  const [height, setHeight] = useState('');
  const [startW, setStartW] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState(addDays(today, 300));
  const [rate, setRate] = useState('');
  const [health, setHealth] = useState('');
  const [show, setShow] = useState({ showWeight: true, showCalories: true, showWorkouts: true, showPhotos: false });
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const v = validateBackup(JSON.parse(await f.text()));
      if (!v.ok) { toast(`Arquivo inválido: ${v.errors[0]}`, 'error'); return; }
      setRestore(v.data);
    } catch { toast('Não foi possível ler o arquivo. Use o .json do seu plano ou um backup do app.', 'error'); }
  }

  const NAMES: Record<string, string> = { displayName: 'nome', ageAtStart: 'idade', heightCm: 'altura', startDate: 'data de início', startWeightKg: 'peso inicial', goalWeightKg: 'objetivo', targetDate: 'data-alvo' };
  function validateProfile() {
    const r = profileFormSchema.safeParse({ displayName: name, ageAtStart: parseDecimal(age) ?? undefined, heightCm: parseDecimal(height) ?? NaN, startDate, startWeightKg: parseDecimal(startW) ?? NaN, goalWeightKg: parseDecimal(goal) ?? NaN, targetDate });
    if (!r.success) { const k = String(r.error.issues[0]?.path[0] ?? ''); setErr(`Verifique o campo “${NAMES[k] ?? k}”.`); return null; }
    if (r.data.targetDate <= r.data.startDate) { setErr('A data-alvo deve ser depois da data de início'); return null; }
    return r.data;
  }

  async function finish() {
    const p = validateProfile();
    if (!p) { setStep(1); return; }
    await save(() => completeOnboarding({
      ...show,
      profile: { ...p, sexForBmr: sex, plannedRateKgPerWeek: parseDecimal(rate) ?? undefined, healthNotes: health.trim() || undefined },
    }), 'Plano configurado. Bem-vindo!');
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-10 pt-safe">
      <div className="pt-8 pb-5">
        <p className="eyebrow !text-accent">Corpo Atlético 2027</p>
        <h1 className="display mt-1 text-[34px] font-bold leading-none">{['Bem-vindo', 'Seus dados', 'Seu painel', 'Antes de começar'][step]}</h1>
        {step > 0 && <p className="mt-1 text-sm text-muted">Passo {step} de 3</p>}
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <Card>
            <p className="text-[15px] leading-relaxed">Acompanhe peso, alimentação, água, hábitos e treinos rumo a uma transformação gradual: reduzir gordura e preservar/ganhar músculo.</p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>🔒 Seus dados ficam <b className="text-fg">neste dispositivo</b>. Sem login, sem servidor.</li>
              <li>📈 Gráficos mostram só o que você registrar — nada é inventado.</li>
              <li>💾 Faça backups em JSON periodicamente.</li>
            </ul>
          </Card>
          <Button className="w-full min-h-13 text-base" onClick={() => fileRef.current?.click()}>Usar meu plano inicial (arquivo .json)</Button>
          <p className="-mt-2 text-center text-xs text-muted">Também serve para restaurar um backup exportado pelo app.</p>
          <Button variant="secondary" className="w-full" onClick={() => setStep(1)}>Configurar do zero</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo do plano ou backup" onChange={onFile} />
          <ConfirmDialog open={!!restore} title="Carregar este arquivo?" confirmLabel="Carregar" onCancel={() => setRestore(null)}
            onConfirm={async () => { if (restore) { const ok = await save(() => importBackup(restore, 'replace').then(() => true), 'Plano carregado. Bem-vindo!'); if (ok) setRestore(null); } }}>
            {restore?.profile && <p className="num">{restore.profile.displayName}: {restore.profile.startWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} → {restore.profile.goalWeightKg.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg</p>}
            {restore && <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">{backupCounts(restore).map((c) => <li key={c.label} className="flex justify-between gap-2"><span className="text-muted">{c.label}</span><span className="num font-semibold">{c.count}</span></li>)}</ul>}
            <p className="text-sm text-muted">Metas e plano entram como configuração editável. Registros só aparecem se o arquivo for um backup com registros.</p>
          </ConfirmDialog>
        </div>
      )}

      {step === 1 && (
        <Card>
          <div className="space-y-3">
            {err && <p role="alert" className="text-sm font-medium text-danger">⚠ {err}</p>}
            <Field label="Nome no app">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Idade">{(id) => <TextInput id={id} inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />}</Field>
              <Field label="Sexo (cálculo da TMB)">{(id) => <Select id={id} value={sex} onChange={(e) => setSex(e.target.value as Sex)}><option value="unspecified">Não informar</option><option value="male">Masculino</option><option value="female">Feminino</option></Select>}</Field>
              <Field label="Altura (cm)">{(id) => <TextInput id={id} inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} />}</Field>
              <Field label="Peso inicial (kg)">{(id) => <TextInput id={id} inputMode="decimal" value={startW} onChange={(e) => setStartW(e.target.value)} />}</Field>
              <Field label="Data de início">{(id) => <TextInput id={id} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />}</Field>
              <Field label="Objetivo (kg)">{(id) => <TextInput id={id} inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} />}</Field>
              <Field label="Data-alvo">{(id) => <TextInput id={id} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}</Field>
              <Field label="Ritmo (kg/semana)">{(id) => <TextInput id={id} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="opcional" />}</Field>
            </div>
            <Field label="Dores, lesões ou condições a considerar (opcional)" hint="Aparece nos alertas de segurança dos treinos.">
              {(id) => <textarea id={id} rows={3} className="w-full rounded-xl border border-line bg-card2 p-3" value={health} onChange={(e) => setHealth(e.target.value)} />}
            </Field>
            <p className="text-xs text-muted">Metas nutricionais, marcos intermediários e refeições podem ser ajustados depois em Perfil.</p>
            <div className="flex gap-2 pt-2"><Button variant="secondary" onClick={() => setStep(0)}>Voltar</Button><Button className="flex-1" onClick={() => { if (validateProfile()) { setErr(null); setStep(2); } }}>Continuar</Button></div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <p className="mb-2 text-sm text-muted">O que deve aparecer no painel “Hoje”?</p>
          <div className="divide-y divide-line">
            <Toggle label="Peso e progresso" checked={show.showWeight} onChange={(v) => setShow((s) => ({ ...s, showWeight: v }))} />
            <Toggle label="Calorias e macros" checked={show.showCalories} onChange={(v) => setShow((s) => ({ ...s, showCalories: v }))} />
            <Toggle label="Treinos" checked={show.showWorkouts} onChange={(v) => setShow((s) => ({ ...s, showWorkouts: v }))} />
            <Toggle label="Fotos de progresso" description="Privadas, só no aparelho" checked={show.showPhotos} onChange={(v) => setShow((s) => ({ ...s, showPhotos: v }))} />
          </div>
          <div className="flex gap-2 pt-4"><Button variant="secondary" onClick={() => setStep(1)}>Voltar</Button><Button className="flex-1" onClick={() => setStep(3)}>Continuar</Button></div>
        </Card>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Alert tone="warn" title="Alerta de segurança">
            {health.trim() && <p>Você informou: <b>{health.trim()}</b>.</p>}
            <p className="mt-1">Dores articulares, lesões ou inchaço (principalmente em um só lado) pedem avaliação profissional antes de iniciar ou intensificar exercícios. Os treinos ficarão como <b>planejados / não liberados</b> até você confirmar orientação. Falta de ar, dor no peito ou desmaio: ligue 192 (SAMU).</p>
          </Alert>
          <p className="text-xs text-muted">Este app apoia o acompanhamento; não diagnostica doenças nem promete resultados. Permissões (câmera, notificações) só serão pedidas no momento de uso.</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => setStep(2)}>Voltar</Button><Button className="flex-1 min-h-13 text-base" onClick={finish}>Entendi, entrar no painel</Button></div>
        </div>
      )}
    </main>
  );
}
