import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, Segmented, Sheet, useToast } from '../../components/ui';
import { useSave, useSettingsOrDefault } from '../../app/hooks';
import { backupFileName, clearAllData, exportBackup, importBackup, updateSettings, type ImportMode } from '../../data/repo';
import { backupCounts, validateBackup } from '../../domain/validations';
import { formatBR, dateInTimeZone } from '../../domain/dates';
import type { BackupFile } from '../../domain/types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function download(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function BackupCard() {
  const settings = useSettingsOrDefault();
  const save = useSave();
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ data: BackupFile; warnings: string[]; fileName: string } | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmImport, setConfirmImport] = useState(false);
  const [clear1, setClear1] = useState(false);
  const [clear2, setClear2] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => { if (e.usage !== undefined) setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB usados`); }).catch(() => {});
  }, []);

  async function doExport() {
    const data = await save(() => exportBackup());
    if (!data) return;
    download(backupFileName(settings.timeZone), JSON.stringify(data, null, 2));
    await save(() => updateSettings({ lastBackupAt: new Date().toISOString() }));
    show('Backup exportado. Guarde o arquivo em local seguro (Arquivos/iCloud).', 'ok');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) { show('Arquivo grande demais (máx. 25 MB).', 'error'); return; }
    try {
      const json = JSON.parse(await f.text());
      const v = validateBackup(json);
      if (!v.ok) { show(`Backup inválido: ${v.errors[0]}`, 'error'); return; }
      setPreview({ data: v.data, warnings: v.warnings, fileName: f.name });
      setMode('merge');
    } catch {
      show('Não foi possível ler o arquivo. Verifique se é um JSON exportado por este app.', 'error');
    }
  }

  async function runImport() {
    if (!preview) return;
    const ok = await save(() => importBackup(preview.data, mode).then(() => true), mode === 'replace' ? 'Dados substituídos pelo backup' : 'Backup mesclado sem duplicar registros');
    if (ok) { setConfirmImport(false); setPreview(null); }
  }

  const last = settings.lastBackupAt ? formatBR(dateInTimeZone(new Date(settings.lastBackupAt), settings.timeZone)) : null;

  return (
    <Card title="Backup e dados">
      <div className="space-y-3">
        <Alert tone="warn" title="Seus dados ficam só neste aparelho">
          Limpar dados do navegador/Safari, remover o app da tela inicial ou trocar de celular pode apagar tudo. No iPhone, o armazenamento depende das políticas do Safari e do espaço livre. <b>Exporte backups com frequência.</b>
        </Alert>
        <p className="text-sm text-muted">Último backup: <b className="text-fg">{last ?? 'nunca'}</b>{usage && ` · ${usage}`}{persisted !== null && ` · armazenamento ${persisted ? 'persistente' : 'sujeito a limpeza pelo navegador'}`}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={doExport}>⬇ Exportar JSON</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>⬆ Importar JSON</Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} aria-label="Arquivo de backup" />
        {persisted === false && navigator.storage?.persist && (
          <Button variant="ghost" className="w-full" onClick={async () => { const p = await navigator.storage.persist(); setPersisted(p); show(p ? 'Armazenamento persistente ativado' : 'O navegador não concedeu armazenamento persistente. Instale o app na tela inicial e mantenha backups.', p ? 'ok' : 'info'); }}>
            Pedir armazenamento persistente
          </Button>
        )}
        <Button variant="ghost" className="w-full text-danger" onClick={() => setClear1(true)}>Apagar todos os dados…</Button>
      </div>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Prévia da importação"
        footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setPreview(null)}>Cancelar</Button><Button className="flex-1" onClick={() => setConfirmImport(true)}>Continuar</Button></div>}>
        {preview && (
          <div className="space-y-3 text-sm">
            <p><b>{preview.fileName}</b> · exportado em {formatBR(dateInTimeZone(new Date(preview.data.exportedAt), settings.timeZone))}</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
              {backupCounts(preview.data).map((c) => <li key={c.label} className="flex justify-between gap-2"><span className="text-muted">{c.label}</span><span className="num font-semibold">{c.count}</span></li>)}
            </ul>
            {preview.data.profile && <p className="text-muted">Perfil: {preview.data.profile.displayName} · {preview.data.profile.startWeightKg} → {preview.data.profile.goalWeightKg} kg</p>}
            {preview.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
            <Segmented label="Modo de importação" value={mode} onChange={setMode} options={[{ value: 'merge', label: 'Mesclar' }, { value: 'replace', label: 'Substituir tudo' }]} />
            <p className="text-muted">{mode === 'merge'
              ? 'Mesclar: registros com o mesmo ID são atualizados, novos são adicionados. Importar o mesmo arquivo de novo não duplica.'
              : 'Substituir: apaga todos os dados atuais deste aparelho e restaura exatamente o arquivo.'}</p>
          </div>
        )}
      </Sheet>
      <ConfirmDialog open={confirmImport} title={mode === 'replace' ? 'Substituir todos os dados?' : 'Mesclar backup?'} danger={mode === 'replace'}
        confirmLabel={mode === 'replace' ? 'Substituir' : 'Mesclar'} requireText={mode === 'replace' ? 'SUBSTITUIR' : undefined}
        onCancel={() => setConfirmImport(false)} onConfirm={runImport}>
        <p>{mode === 'replace' ? 'Os dados atuais serão apagados e trocados pelos do arquivo. Considere exportar um backup antes.' : 'Os registros do arquivo serão combinados com os atuais, sem duplicar.'}</p>
      </ConfirmDialog>
      <ConfirmDialog open={clear1} title="Apagar todos os dados?" danger confirmLabel="Continuar" onCancel={() => setClear1(false)} onConfirm={() => { setClear1(false); setClear2(true); }}>
        <p>Isto remove perfil, metas, pesagens, alimentação, água, treinos e checklist deste aparelho. Não há como desfazer sem um backup.</p>
        <Button variant="secondary" className="w-full" onClick={doExport}>Exportar backup antes</Button>
      </ConfirmDialog>
      <ConfirmDialog open={clear2} title="Confirmação final" danger confirmLabel="Apagar tudo" requireText="APAGAR" onCancel={() => setClear2(false)}
        onConfirm={async () => { const ok = await save(() => clearAllData().then(() => true), 'Todos os dados foram apagados'); if (ok) { setClear2(false); location.hash = '#/'; } }}>
        <p>Segunda confirmação: os dados serão apagados definitivamente.</p>
      </ConfirmDialog>
    </Card>
  );
}
