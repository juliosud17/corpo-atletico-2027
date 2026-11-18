import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Button, Card, Chips, ConfirmDialog, EmptyState, Field, Select, Sheet, TextInput, cx } from '../../components/ui';
import { IconPlus, IconSearch } from '../../components/ui/icons';
import { useSave } from '../../app/hooks';
import { useSheets } from '../../app/sheets';
import { db } from '../../data/db';
import { GROUP_LABEL, type FoodGroup } from '../../data/foodDatabase';
import { deleteFoodItem, removeFoodPortion, saveFoodItem, setFoodFavorite } from '../../data/repo';
import { fmt, fmtInt, hasAnyNutrition, parseDecimal } from '../../domain/calculations';
import { norm } from '../../domain/recipes';
import { proteinPer100kcal } from '../../domain/nutrition';
import type { FoodItem, Unit } from '../../domain/types';
import { PREP_LABEL, UNIT_LABEL, sourceTag } from './FoodSheet';

const GROUP_SINGULAR: Record<FoodGroup, string> = { protein: 'Proteína', carb: 'Carboidrato', dairy: 'Laticínio', fruit: 'Fruta', vegetable: 'Vegetal', fat: 'Gordura', other: 'Outro' };

function FoodDetail({ food: initial, day, onClose }: { food: FoodItem; day: string; onClose: () => void }) {
  const food = useLiveQuery(() => db.foodItems.get(initial.id), [initial.id]) ?? initial;
  const save = useSave();
  const { open } = useSheets();
  const [del, setDel] = useState(false);
  const d = proteinPer100kcal(food);
  return (
    <>
      <Sheet open onClose={onClose} title={food.name}
        footer={<div className="flex gap-2">
          {!food.builtin && <Button variant="secondary" aria-label="Excluir alimento" onClick={() => setDel(true)}>🗑️</Button>}
          <Button variant="secondary" onClick={() => save(() => setFoodFavorite(food.id, !food.favorite), food.favorite ? 'Removido do dia a dia' : 'Adicionado ao dia a dia')}>{food.favorite ? '★ Dia a dia' : '☆ Dia a dia'}</Button>
          <Button className="flex-1" onClick={() => { onClose(); open({ kind: 'food', date: day, foodId: food.id }); }}>Registrar</Button>
        </div>}>
        <div className="space-y-4">
          <p className="text-xs"><span className="font-bold uppercase tracking-wide text-accent">{GROUP_SINGULAR[food.group ?? 'other']}</span><span className="text-muted"> · {sourceTag(food)}{food.preparation ? ` · ${PREP_LABEL[food.preparation]}` : ''}</span></p>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[['kcal', food.kcalPerReference, 0], ['Prot.', food.proteinGPerReference, 1], ['Carb.', food.carbsGPerReference, 1], ['Gord.', food.fatGPerReference, 1]].map(([l, v, dd]) => (
              <div key={l as string} className="rounded-2xl border border-line bg-card2 py-3">
                <p className="eyebrow">{l as string}</p>
                <p className="num mt-1 text-xl font-bold">{v === undefined ? '—' : dd === 0 ? fmtInt(v as number) : fmt(v as number)}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">Valores por {fmt(food.referenceAmount, 0)} {UNIT_LABEL[food.referenceUnit]}{d !== null ? ` · ${fmt(d)} g de proteína a cada 100 kcal` : ''}.</p>
          {food.source && <p className="text-xs text-muted">Fonte: {food.source}</p>}
          {food.note && <p className="text-sm text-warn">ⓘ {food.note}</p>}
          <div>
            <p className="eyebrow mb-2">Minhas porções</p>
            {food.portions?.length ? (
              <ul className="flex flex-wrap gap-1.5">{food.portions.map((p) => (
                <li key={p.label} className="inline-flex items-center rounded-full border border-line pl-3 text-sm">{p.label} · {fmt(p.amount, p.amount % 1 ? 1 : 0)} {UNIT_LABEL[food.referenceUnit]}
                  <button type="button" className="px-2 py-1.5 text-muted" aria-label={`Remover porção ${p.label}`} onClick={() => save(() => removeFoodPortion(food.id, p.label))}>✕</button></li>
              ))}</ul>
            ) : <p className="text-sm text-muted">Nenhuma ainda. Ao registrar, informe a quantidade e toque em “Salvar” para criar uma porção (ex.: “1 filé = 120 g”).</p>}
          </div>
        </div>
      </Sheet>
      <ConfirmDialog open={del} danger title="Excluir alimento?" confirmLabel="Excluir" onCancel={() => setDel(false)}
        onConfirm={async () => { await save(() => deleteFoodItem(food.id), 'Alimento excluído'); setDel(false); onClose(); }}>
        <p>Os registros já feitos continuam com seus valores.</p>
      </ConfirmDialog>
    </>
  );
}

function CreateFood({ onClose }: { onClose: () => void }) {
  const save = useSave();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<FoodGroup>('protein');
  const [prep, setPrep] = useState<'raw' | 'cooked' | 'other'>('cooked');
  const [ref, setRef] = useState('100');
  const [unit, setUnit] = useState<Unit>('g');
  const [v, setV] = useState({ k: '', p: '', c: '', f: '' });
  const [src, setSrc] = useState('');
  const o = (s: string) => parseDecimal(s) ?? undefined;
  return (
    <Sheet open onClose={onClose} title="Criar alimento"
      footer={<Button className="w-full" disabled={!name.trim() || !o(ref)} onClick={async () => {
        const id = await save(() => saveFoodItem({ name: name.trim(), group, preparation: prep, referenceAmount: o(ref)!, referenceUnit: unit, kcalPerReference: o(v.k), proteinGPerReference: o(v.p), carbsGPerReference: o(v.c), fatGPerReference: o(v.f), source: src.trim() || 'Informado por você', favorite: true }), 'Alimento criado');
        if (id) onClose();
      }}>Salvar alimento</Button>}>
      <div className="space-y-3">
        <Field label="Nome">{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Milanesa da padaria" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Grupo">{(id) => <Select id={id} value={group} onChange={(e) => setGroup(e.target.value as FoodGroup)}>{(Object.keys(GROUP_LABEL) as FoodGroup[]).map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</Select>}</Field>
          <Field label="Estado">{(id) => <Select id={id} value={prep} onChange={(e) => setPrep(e.target.value as 'raw')}><option value="cooked">pronto/cozido</option><option value="raw">cru</option><option value="other">outro</option></Select>}</Field>
          <Field label="Valores por">{(id) => <TextInput id={id} inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} />}</Field>
          <Field label="Unidade">{(id) => <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as Unit)}><option value="g">g</option><option value="ml">ml</option><option value="unit">unid.</option></Select>}</Field>
          <Field label="kcal">{(id) => <TextInput id={id} inputMode="decimal" value={v.k} onChange={(e) => setV({ ...v, k: e.target.value })} placeholder="—" />}</Field>
          <Field label="Proteína (g)">{(id) => <TextInput id={id} inputMode="decimal" value={v.p} onChange={(e) => setV({ ...v, p: e.target.value })} placeholder="—" />}</Field>
          <Field label="Carboidrato (g)">{(id) => <TextInput id={id} inputMode="decimal" value={v.c} onChange={(e) => setV({ ...v, c: e.target.value })} placeholder="—" />}</Field>
          <Field label="Gordura (g)">{(id) => <TextInput id={id} inputMode="decimal" value={v.f} onChange={(e) => setV({ ...v, f: e.target.value })} placeholder="—" />}</Field>
        </div>
        <Field label="Fonte (rótulo, TACO…)">{(id) => <TextInput id={id} value={src} onChange={(e) => setSrc(e.target.value)} />}</Field>
        <p className="text-xs text-muted">Deixe em branco o que não souber — nada é inventado.</p>
      </div>
    </Sheet>
  );
}

/** Aba “Alimentos”: base TACO/IBGE + alimentos seus. */
export function FoodsTab({ day }: { day: string }) {
  const foods = useLiveQuery(() => db.foodItems.toArray(), [], [] as FoodItem[]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<'' | FoodGroup | 'fav'>('');
  const [detail, setDetail] = useState<FoodItem | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const n = norm(q);
    return foods.filter((f) => (!n || norm(f.name).includes(n)) && (!group || (group === 'fav' ? f.favorite : f.group === group)))
      .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [foods, q, group]);
  return (
    <>
      <Card title="Base de alimentos" subtitle="Selecione para ver detalhes" icon={<IconSearch />}
        action={<Button className="!px-3" onClick={() => setCreating(true)}><IconPlus /> Criar</Button>}>
        <TextInput type="search" aria-label="Buscar alimento" placeholder="Buscar alimento…" value={q} onChange={(e) => setQ(e.target.value)} className="!min-h-14 !rounded-3xl !text-[17px]" />
        <div className="mt-3">
          <Chips label="Filtrar alimentos" value={group} onChange={setGroup} options={[{ value: '', label: 'Todos' }, { value: 'fav', label: '★ Dia a dia' }, { value: 'protein', label: 'Proteína' }, { value: 'carb', label: 'Carboidrato' }, { value: 'dairy', label: 'Laticínio' }, { value: 'fruit', label: 'Fruta' }, { value: 'vegetable', label: 'Vegetal' }, { value: 'fat', label: 'Gordura' }]} />
        </div>
        <ul className="mt-3 space-y-2.5">
          {list.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => setDetail(f)} className="flex w-full items-start justify-between gap-3 rounded-3xl border border-line bg-card2/30 px-4 py-4 text-left hover:border-accent/60">
                <span className="min-w-0">
                  <span className="block text-[17px] font-semibold leading-snug">{f.favorite && <span className="text-accent">★ </span>}{f.name}</span>
                  <span className="mt-1 block text-xs">
                    <span className="font-bold uppercase tracking-wide text-accent">{GROUP_SINGULAR[f.group ?? 'other']}</span>
                    <span className="text-muted"> · por {fmt(f.referenceAmount, 0)}{UNIT_LABEL[f.referenceUnit]}{f.preparation ? ` · ${PREP_LABEL[f.preparation]}` : ''}</span>
                  </span>
                </span>
                <span className={cx('num shrink-0 text-right', !hasAnyNutrition(f) && 'text-warn')}>
                  {hasAnyNutrition(f) ? (
                    <>
                      <span className="block text-[22px] font-bold leading-none">{fmtInt(f.kcalPerReference)} <span className="text-xs font-medium text-muted">KCAL</span></span>
                      <span className="mt-1 block text-[11px] font-semibold tracking-wide text-muted">P:{fmt(f.proteinGPerReference)}G C:{fmt(f.carbsGPerReference)}G G:{fmt(f.fatGPerReference)}G</span>
                    </>
                  ) : <span className="text-xs">sem dados</span>}
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && <li><EmptyState icon="🔎">Nada encontrado. Toque em “Criar” para cadastrar com os valores do rótulo.</EmptyState></li>}
        </ul>
        <p className="mt-3 text-xs text-muted">Valores oficiais da TACO (Unicamp) e do IBGE, por 100 g. Sem whey e sem peixes.</p>
      </Card>
      {detail && <FoodDetail food={detail} day={day} onClose={() => setDetail(null)} />}
      {creating && <CreateFood onClose={() => setCreating(false)} />}
    </>
  );
}
