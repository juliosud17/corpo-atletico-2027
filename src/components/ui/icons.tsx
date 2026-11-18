// Ícones de linha simples (sem dependências), herdam a cor do texto.
import type { ReactNode } from 'react';

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>;
}
export const IconCoffee = () => <Svg><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M7 3v2M10 3v2M13 3v2" /></Svg>;
export const IconUtensils = () => <Svg><path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2 6 0 8v10" /></Svg>;
export const IconSun = () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>;
export const IconMoon = () => <Svg><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>;
export const IconBook = () => <Svg><path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5zM12 6v14" /></Svg>;
export const IconApple = () => <Svg><path d="M12 7c-1-2-4-2.5-5.5-.5S5 12 6.5 15 10 20 12 19c2 1 4-1 5.5-4s1-6.5-.5-8.5S13 5 12 7z" /><path d="M12 7c0-2 1-3.5 3-4" /></Svg>;
export const IconSearch = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></Svg>;
export const IconPlate = () => <Svg><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></Svg>;
export const IconRefresh = () => <Svg><path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5l2-2.5M20 20v-5h-5" /></Svg>;
export const IconChevron = () => <Svg size={20}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconClock = () => <Svg size={16}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>;
export const IconLink = () => <Svg><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const IconPlus = () => <Svg size={20}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></Svg>;

export function MealIcon({ label }: { label: string }) {
  const n = label.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (n.includes('cafe')) return <IconCoffee />;
  if (n.includes('lanche')) return <IconSun />;
  if (n.includes('jantar') || n.includes('ceia')) return <IconMoon />;
  return <IconUtensils />;
}
