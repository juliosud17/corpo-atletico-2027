import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, ConfirmDialog, EmptyState, Field, Page, Segmented, Select, Sheet, TextInput, cx } from '../../components/ui';
import { useSave, useToday } from '../../app/hooks';
import { db } from '../../data/db';
import { bufferUrl, processImage, type ProcessedImage } from '../../data/images';
import { deletePhoto, savePhoto, updatePhoto } from '../../data/repo';
import { fmt } from '../../domain/calculations';
import { diffDays, formatBR } from '../../domain/dates';
import type { ProgressPhoto } from '../../domain/types';

export const ANGLE_LABEL: Record<ProgressPhoto['angle'], string> = { front: 'Frente', side: 'Perfil', back: 'Costas', other: 'Outro' };

/** Selo inequívoco: texto + ícone + estilo diferentes para foto real e simulação (não só cor). */
export function KindBadge({ kind, className }: { kind: ProgressPhoto['photoKind']; className?: string }) {
  return kind === 'real'
    ? <span className={cx('inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-fg', className)}>📷 Foto real</span>
    : <span className={cx('inline-flex items-center gap-1 rounded-md border-2 border-dashed border-warn bg-card px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-warn', className)}>✨ Simulação</span>;
}

/** Carrega a imagem (miniatura ou completa) sob demanda e libera a memória ao sair. */
export function PhotoImage({ photo, full, className, alt }: { photo: ProgressPhoto; full?: boolean; className?: string; alt?: string }) {
  const blob = useLiveQuery(() => db.photoBlobs.get(photo.blobKey), [photo.blobKey]);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const u = bufferUrl(full || !blob.thumb ? blob.data : blob.thumb, blob.type);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob, full]);
  const label = alt ?? `${photo.photoKind === 'real' ? 'Foto real' : 'Simulação de objetivo'} — ${ANGLE_LABEL[photo.angle]}, ${formatBR(photo.capturedOn)}`;
  if (blob === undefined) return <div className={cx('animate-pulse bg-card2', className)} aria-label="Carregando imagem" />;
  if (!blob || !url) return <div className={cx('flex items-center justify-center bg-card2 text-xs text-muted', className)}>imagem indisponível</div>;
  return <img src={url} alt={label} className={cx('object-cover', className)} />;
}

function AddPhotoSheet({ onClose }: { onClose: () => void }) {
  const today = useToday();
  const save = useSave();
  const fileRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<ProcessedImage | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [angle, setAngle] = useState<ProgressPhoto['angle']>('front');
  const [kind, setKind] = useState<ProgressPhoto['photoKind'] | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const p = await processImage(f);
      setImg(p);
      setPreview(bufferUrl(p.thumb));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  async function submit() {
    if (!img) { setErr('Escolha uma imagem'); return; }
    if (!kind) { setErr('Indique se é foto real ou simulação'); return; }
    const id = await save(() => savePhoto({ capturedOn: date, angle, photoKind: kind, width: img.width, height: img.height, note: note.trim() || undefined },
      { type: img.type, data: img.data, thumb: img.thumb }), kind === 'real' ? 'Foto real salva no aparelho' : 'Simulação salva no aparelho');
    if (id) onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Adicionar foto" footer={<Button className="w-full" disabled={!img || !kind || busy} onClick={submit}>Salvar foto</Button>}>
      <div className="space-y-4">
        <Alert tone="info">A foto é reduzida e guardada <b>só neste aparelho</b>. Nada é enviado para servidores ou IA.</Alert>
        {err && <p role="alert" className="text-sm font-medium text-danger">⚠ {err}</p>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" aria-label="Arquivo de imagem" onChange={onFile} />
        {preview ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="block w-full overflow-hidden rounded-xl border border-line" aria-label="Trocar imagem">
            <img src={preview} alt="Pré-visualização" className="mx-auto max-h-64 object-contain" />
          </button>
        ) : (
          <Button variant="secondary" className="min-h-24 w-full" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Processando…' : '📷 Tirar foto ou escolher da galeria'}</Button>
        )}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-muted">Tipo de imagem (obrigatório)</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={kind === 'real'} onClick={() => setKind('real')} className={cx('min-h-16 rounded-xl border-2 p-2 text-left text-sm', kind === 'real' ? 'border-accent bg-accent-soft' : 'border-line')}>
              <KindBadge kind="real" /><span className="mt-1 block text-xs text-muted">Foto minha, de verdade</span>
            </button>
            <button type="button" aria-pressed={kind === 'simulation'} onClick={() => setKind('simulation')} className={cx('min-h-16 rounded-xl border-2 p-2 text-left text-sm', kind === 'simulation' ? 'border-warn bg-warn-soft' : 'border-line')}>
              <KindBadge kind="simulation" /><span className="mt-1 block text-xs text-muted">Imagem de objetivo (referência artística)</span>
            </button>
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">{(id) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Ângulo">{(id) => <Select id={id} value={angle} onChange={(e) => setAngle(e.target.value as ProgressPhoto['angle'])}>{Object.entries(ANGLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        </div>
        <Field label="Observação (opcional)">{(id) => <TextInput id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: mesma luz, manhã" />}</Field>
        <p className="text-xs text-muted">Dica: mesmo lugar, luz e horário, no dia 17 de cada mês. O app não estima gordura corporal por fotos.</p>
      </div>
    </Sheet>
  );
}

function PhotoViewer({ photo: initial, onClose }: { photo: ProgressPhoto; onClose: () => void }) {
  const save = useSave();
  const photo = useLiveQuery(() => db.photos.get(initial.id), [initial.id]) ?? initial;
  const [del, setDel] = useState(false);
  return (
    <>
      <Sheet open onClose={onClose} title={`${ANGLE_LABEL[photo.angle]} · ${formatBR(photo.capturedOn)}`}
        footer={<div className="flex gap-2"><Button variant="secondary" aria-label="Excluir foto" onClick={() => setDel(true)}>🗑️</Button>
          <Button variant="secondary" className="flex-1" onClick={() => save(() => updatePhoto(photo.id, { photoKind: photo.photoKind === 'real' ? 'simulation' : 'real' }), 'Rótulo alterado')}>
            Marcar como {photo.photoKind === 'real' ? 'simulação' : 'foto real'}
          </Button></div>}>
        <div className="space-y-2">
          <KindBadge kind={photo.photoKind} />
          {photo.photoKind === 'simulation' && <p className="text-xs text-warn">Imagem de simulação: referência artística, não previsão nem garantia de resultado.</p>}
          <PhotoImage photo={photo} full className="w-full rounded-xl" />
          {photo.note && <p className="text-sm text-muted">{photo.note}</p>}
        </div>
      </Sheet>
      <ConfirmDialog open={del} danger title="Excluir foto?" confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { const ok = await save(() => deletePhoto(photo.id).then(() => true), 'Foto excluída'); if (ok) { setDel(false); onClose(); } }}>
        <p>A imagem será apagada deste aparelho. Se ela não estiver em um backup com fotos, não há como recuperar.</p>
      </ConfirmDialog>
    </>
  );
}

function Compare({ photos }: { photos: ProgressPhoto[] }) {
  const [angle, setAngle] = useState<ProgressPhoto['angle']>('front');
  const ofAngle = photos.filter((p) => p.angle === angle).sort((a, b) => a.capturedOn.localeCompare(b.capturedOn) || a.createdAt.localeCompare(b.createdAt));
  const reals = ofAngle.filter((p) => p.photoKind === 'real');
  const [aId, setAId] = useState<string>('');
  const [bId, setBId] = useState<string>('');
  const a = ofAngle.find((p) => p.id === aId) ?? reals[0] ?? ofAngle[0];
  const b = ofAngle.find((p) => p.id === bId) ?? reals[reals.length - 1] ?? ofAngle[ofAngle.length - 1];
  const measurements = useLiveQuery(() => db.measurements.toArray(), []) ?? [];
  const waistNear = (d: string) => measurements.filter((m) => m.waistCm !== undefined && Math.abs(diffDays(m.measuredOn, d)) <= 7).sort((x, y) => Math.abs(diffDays(x.measuredOn, d)) - Math.abs(diffDays(y.measuredOn, d)))[0];
  const weights = useLiveQuery(() => db.weights.toArray(), []) ?? [];
  const weightNear = (d: string) => weights.filter((w) => Math.abs(diffDays(w.date, d)) <= 3).sort((x, y) => Math.abs(diffDays(x.date, d)) - Math.abs(diffDays(y.date, d)))[0];
  const opt = (p: ProgressPhoto) => `${formatBR(p.capturedOn).slice(0, 6)}${p.capturedOn.slice(2, 4)} · ${p.photoKind === 'real' ? 'real' : 'SIMULAÇÃO'}`;

  return (
    <Card title="Comparar lado a lado">
      <Segmented label="Ângulo" value={angle} onChange={(v) => { setAngle(v); setAId(''); setBId(''); }} options={(['front', 'side', 'back'] as const).map((k) => ({ value: k, label: ANGLE_LABEL[k] }))} />
      {ofAngle.length < 2 ? <p className="mt-3 text-sm text-muted">São necessárias duas imagens com este ângulo.</p> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[{ p: a, set: setAId, label: 'Antes' }, { p: b, set: setBId, label: 'Depois' }].map(({ p, set, label }) => (
              <div key={label} className="min-w-0 space-y-1.5">
                <Select aria-label={`Imagem “${label}”`} value={p?.id ?? ''} onChange={(e) => set(e.target.value)} className="!min-h-9 py-1 text-xs">
                  {ofAngle.map((x) => <option key={x.id} value={x.id}>{opt(x)}</option>)}
                </Select>
                {p && (
                  <figure className="relative m-0">
                    <PhotoImage photo={p} full className="aspect-[3/4] w-full rounded-xl" />
                    <figcaption className="absolute left-1.5 top-1.5"><KindBadge kind={p.photoKind} /></figcaption>
                  </figure>
                )}
                {p && (
                  <p className="num text-xs text-muted">
                    {formatBR(p.capturedOn)}
                    {p.photoKind === 'real' && weightNear(p.capturedOn) && <> · {fmt(weightNear(p.capturedOn)!.weightKg)} kg</>}
                    {p.photoKind === 'real' && waistNear(p.capturedOn) && <> · cintura {fmt(waistNear(p.capturedOn)!.waistCm)} cm</>}
                  </p>
                )}
              </div>
            ))}
          </div>
          {(a?.photoKind === 'simulation' || b?.photoKind === 'simulation') && (
            <Alert tone="warn">Uma das imagens é <b>simulação</b>: referência artística de objetivo, não foto real nem previsão de resultado.</Alert>
          )}
          <p className="mt-2 text-xs text-muted">Peso e cintura vêm dos registros próximos à data (±3 e ±7 dias). Nenhuma estimativa é feita a partir das imagens.</p>
        </>
      )}
    </Card>
  );
}

export function PhotosPage() {
  const photos = useLiveQuery(() => db.photos.toArray(), [], [] as ProgressPhoto[]);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [filter, setFilter] = useState<'all' | 'real' | 'simulation'>('all');
  const groups = useMemo(() => {
    const list = photos.filter((p) => filter === 'all' || p.photoKind === filter).sort((a, b) => b.capturedOn.localeCompare(a.capturedOn));
    const m = new Map<string, ProgressPhoto[]>();
    for (const p of list) m.set(p.capturedOn, [...(m.get(p.capturedOn) ?? []), p]);
    return [...m.entries()];
  }, [photos, filter]);

  return (
    <Page title="Fotos" subtitle="Privadas, só neste aparelho" action={<Button onClick={() => setAdding(true)}>+ Foto</Button>}>
      <Alert tone="info" title="Opcional e privado">Fotos não são obrigatórias. Ficam no armazenamento local, sem upload. Backups só incluem as imagens se você marcar essa opção ao exportar.</Alert>
      {photos.length >= 2 && <Compare photos={photos} />}
      <Card title="Galeria" action={<span className="text-xs text-muted">{photos.filter((p) => p.photoKind === 'real').length} reais · {photos.filter((p) => p.photoKind === 'simulation').length} simulações</span>}>
        <div className="mb-3"><Segmented label="Filtrar" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todas' }, { value: 'real', label: 'Reais' }, { value: 'simulation', label: 'Simulações' }]} /></div>
        {groups.length === 0 ? <EmptyState icon="📷">Sua primeira foto aparecerá aqui.</EmptyState> : (
          <div className="space-y-4">
            {groups.map(([date, list]) => (
              <div key={date}>
                <p className="mb-1.5 text-sm font-semibold">{formatBR(date)}</p>
                <ul className="grid grid-cols-3 gap-2">
                  {list.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setViewing(p)} className="relative block w-full overflow-hidden rounded-xl border border-line" aria-label={`Abrir ${p.photoKind === 'real' ? 'foto real' : 'simulação'} — ${ANGLE_LABEL[p.angle]}, ${formatBR(p.capturedOn)}`}>
                        <PhotoImage photo={p} className="aspect-[3/4] w-full" />
                        <span className="absolute inset-x-1 bottom-1 flex flex-col items-start gap-0.5"><KindBadge kind={p.photoKind} className="!text-[9px]" /><span className="rounded bg-black/60 px-1 text-[10px] text-white">{ANGLE_LABEL[p.angle]}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      {adding && <AddPhotoSheet onClose={() => setAdding(false)} />}
      {viewing && <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />}
    </Page>
  );
}
