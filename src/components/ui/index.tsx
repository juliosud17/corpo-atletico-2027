import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

// Card ------------------------------------------------------------------------
export function Card({ children, className, title, subtitle, icon, action }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-3xl border border-line bg-card p-4 sm:p-5', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-xl text-accent">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="display text-[19px] font-semibold leading-tight text-fg">{title}</h2>}
              {subtitle && <p className="eyebrow mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Bloco de número grande (estilo PESO / ALTURA / IMC). */
export function StatTile({ label, value, unit, sub, tone }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'accent' }) {
  return (
    <div className="min-w-0 rounded-3xl border border-line bg-card px-2 py-3 text-center">
      <p className="eyebrow">{label}</p>
      <p className={cx('num mt-1 text-[26px] font-bold leading-none', tone === 'accent' && 'text-accent')}>{value}{unit && <span className="ml-0.5 text-sm font-medium text-muted">{unit}</span>}</p>
      {sub && <p className="eyebrow mt-1 !text-[0.62rem]">{sub}</p>}
    </div>
  );
}

/** Abas grandes estilo “TREINO | PLANO | DIETA”. */
export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-11 flex-1 whitespace-nowrap rounded-xl px-1.5 text-[12.5px] font-semibold uppercase tracking-normal transition', value === o.value ? 'bg-card2 text-fg' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Chips de filtro (ativo em laranja). */
export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => (
        <button key={o.value || 'all'} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-10 shrink-0 rounded-2xl border px-4 text-xs font-semibold uppercase tracking-[0.14em] transition', value === o.value ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Button ---------------------------------------------------------------------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-fg font-semibold hover:brightness-110',
    secondary: 'bg-card2 text-fg border border-line hover:brightness-110',
    ghost: 'text-accent hover:bg-accent-soft',
    danger: 'bg-danger text-white font-semibold hover:brightness-110',
  };
  return (
    <button type="button" {...rest}
      className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-center text-[14px] font-semibold uppercase leading-tight tracking-[0.06em] transition disabled:opacity-50 disabled:cursor-not-allowed', styles[variant], className)}>
      {children}
    </button>
  );
}

// Field ----------------------------------------------------------------------
export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx('flex min-w-0 flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-muted">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-danger">⚠ {error}</p>}
    </div>
  );
}

export const inputCls = 'w-full min-w-0 min-h-11 rounded-2xl border border-line bg-card2 px-3 py-2 text-fg placeholder:text-muted/70 focus:border-accent outline-none';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, 'appearance-none', props.className)} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
      <span>
        <span className="block text-[15px]">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={cx('relative h-7 w-12 shrink-0 rounded-full border border-line transition peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-accent', checked ? 'bg-accent' : 'bg-card2')}>
        <span className={cx('absolute top-0.5 h-5.5 w-5.5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </label>
  );
}

// Segmented ------------------------------------------------------------------
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-2xl border border-line bg-card2 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 min-h-9 whitespace-nowrap rounded-xl px-1 text-[13px] font-semibold uppercase tracking-wide transition', value === o.value ? 'bg-accent text-accent-fg' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ProgressBar ----------------------------------------------------------------
export function ProgressBar({ value, max = 100, label, tone = 'accent', valueText }: { value: number; max?: number; label: string; tone?: 'accent' | 'warn' | 'plan'; valueText?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = tone === 'warn' ? 'bg-warn' : tone === 'plan' ? 'bg-plan' : 'bg-accent';
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={valueText}
      className="h-2.5 w-full overflow-hidden rounded-full bg-card2">
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// Alert ----------------------------------------------------------------------
export function Alert({ tone = 'warn', title, children, icon }: { tone?: 'warn' | 'danger' | 'info'; title?: ReactNode; children?: ReactNode; icon?: string }) {
  const s = tone === 'danger' ? 'bg-danger-soft border-danger/50' : tone === 'warn' ? 'bg-warn-soft border-warn/40' : 'bg-accent-soft border-accent/30';
  const ic = icon ?? (tone === 'danger' ? '🚨' : tone === 'warn' ? '⚠️' : 'ℹ️');
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={cx('flex gap-3 rounded-xl border p-3 text-sm', s)}>
      <span aria-hidden className="text-lg leading-5">{ic}</span>
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/90">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ children, icon = '📝' }: { children: ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-4 py-7 text-center text-sm text-muted">
      <span aria-hidden className="text-2xl">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

// Sheet (modal inferior) -------------------------------------------------------
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button');
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="anim-up relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] border border-line bg-card sm:rounded-[2rem]">
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-4">
          <h2 id={titleId} className="display min-w-0 break-words text-[22px] font-semibold leading-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-lg text-fg hover:bg-card2">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

// Confirm dialog ---------------------------------------------------------------
export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirmar', danger, onConfirm, onCancel, requireText }: {
  open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => { if (!open) setTyped(''); }, [open]);
  const blocked = requireText ? typed.trim().toUpperCase() !== requireText : false;
  return (
    <Sheet open={open} onClose={onCancel} title={title}
      footer={<div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={onCancel}>Cancelar</Button><Button variant={danger ? 'danger' : 'primary'} className="flex-1" disabled={blocked} onClick={onConfirm}>{confirmLabel}</Button></div>}>
      <div className="space-y-3 text-[15px]">
        {children}
        {requireText && (
          <Field label={`Para confirmar, digite ${requireText}`}>
            {(id) => <TextInput id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" />}
          </Field>
        )}
      </div>
    </Sheet>
  );
}

// Toasts -----------------------------------------------------------------------
interface Toast { id: number; message: string; tone: 'ok' | 'error' | 'info'; action?: { label: string; run: () => void } }
const ToastCtx = createContext<{ show: (message: string, tone?: Toast['tone'], action?: Toast['action']) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, tone: Toast['tone'] = 'ok', action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 8000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx('anim-up pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
              t.tone === 'error' ? 'border-danger/60 bg-card text-fg' : 'border-line bg-card text-fg')}>
            <span aria-hidden>{t.tone === 'ok' ? '✅' : t.tone === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span className="flex-1">{t.message}</span>
            {t.action && <button type="button" className="font-semibold text-accent" onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// Página -----------------------------------------------------------------------
export function Page({ title, subtitle, children, action }: { title: string; subtitle?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-safe">
      <header className="flex items-end justify-between gap-3 pb-4 pt-6">
        <div className="min-w-0">
          <h1 className="display text-[32px] font-bold leading-none">{title}</h1>
          {subtitle && <p className="eyebrow mt-1.5 first-letter:uppercase">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="space-y-4">{children}</div>
    </main>
  );
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-xl font-bold leading-tight">{value}{unit && <span className="ml-0.5 text-sm font-medium text-muted">{unit}</span>}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
