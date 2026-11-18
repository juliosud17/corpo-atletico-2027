// Utilitários de data puros. Datas de calendário ficam como 'YYYY-MM-DD' e NUNCA
// passam por new Date('YYYY-MM-DD') (que interpreta em UTC e pode "trocar o dia").
import type { ISODate } from './types';

export const DEFAULT_TZ = 'America/Sao_Paulo';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

/** Número de dias desde 1970-01-01 (aritmética de calendário, sem fuso). */
export function toDayNumber(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

export function fromDayNumber(n: number): ISODate {
  const d = new Date(n * 86_400_000);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(a) - toDayNumber(b);
}

/** 0 = domingo … 6 = sábado */
export function weekday(date: ISODate): number {
  // 1970-01-01 foi quinta-feira (4)
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

/** Segunda-feira da semana da data. */
export function weekStartMonday(date: ISODate): ISODate {
  const wd = weekday(date);
  const offset = wd === 0 ? -6 : 1 - wd;
  return addDays(date, offset);
}

export function monthKey(date: ISODate): string {
  return date.slice(0, 7);
}

/** Data de calendário "hoje" no fuso indicado. */
export function todayISO(timeZone: string = DEFAULT_TZ, now: Date = new Date()): ISODate {
  return dateInTimeZone(now, timeZone);
}

export function dateInTimeZone(instant: Date, timeZone: string = DEFAULT_TZ): ISODate {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    const y = instant.getFullYear();
    const mo = String(instant.getMonth() + 1).padStart(2, '0');
    const d = String(instant.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
}

export function timeInTimeZone(instant: Date, timeZone: string = DEFAULT_TZ): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(instant);
  } catch {
    return `${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
  }
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' sem conversão de fuso. */
export function formatBR(date: ISODate | undefined | null): string {
  if (!date) return '—';
  const m = ISO_RE.exec(date);
  if (!m) return date;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function formatShortBR(date: ISODate): string {
  const m = ISO_RE.exec(date);
  if (!m) return date;
  return `${m[3]}/${m[2]}`;
}

/** 'DD/MM/AAAA' → 'YYYY-MM-DD' (ou null se inválida). */
export function parseBR(s: string): ISODate | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isISODate(iso) ? iso : null;
}

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function weekdayName(wd: number): string { return WEEKDAYS[wd] ?? ''; }
export function weekdayShort(wd: number): string { return WEEKDAYS_SHORT[wd] ?? ''; }

export function formatLongBR(date: ISODate): string {
  const m = ISO_RE.exec(date);
  if (!m) return date;
  return `${weekdayName(weekday(date))}, ${+m[3]} de ${MONTHS[+m[2] - 1]} de ${m[1]}`;
}

export function monthLabel(key: string): string {
  const [y, mo] = key.split('-');
  return `${MONTHS[+mo - 1]} de ${y}`;
}

/** Instante ISO com offset local a partir de data + hora locais. */
export function localDateTimeToISO(date: ISODate, time: string = '12:00'): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const dt = new Date(y, mo - 1, d, h || 0, mi || 0, 0);
  return dt.toISOString();
}
