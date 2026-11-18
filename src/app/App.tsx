import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { db } from '../data/db';
import { ToastProvider, cx } from '../components/ui';
import { SheetsProvider } from './sheets';
import { Onboarding } from '../features/onboarding/Onboarding';
import { Today } from '../features/dashboard/Today';
import { Progress } from '../features/progress/Progress';
import { Nutrition } from '../features/nutrition/Nutrition';
import { Workouts } from '../features/workouts/Workouts';
import { Profile } from '../features/profile/Profile';
import { ChecklistPage } from '../features/habits/Checklist';
import { LiveSession } from '../features/workouts/LiveSession';
import type { Settings } from '../domain/types';

const NAV = [
  { to: '/', label: 'Hoje', icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z' },
  { to: '/evolucao', label: 'Evolução', icon: 'M3 17l5-5 4 3 8-8M15 7h5v5' },
  { to: '/alimentacao', label: 'Alimentação', icon: 'M7 3v8a2 2 0 0 0 2 2v8M11 3v8M7 7h4M17 3c-2 2-2 6 0 8v10' },
  { to: '/treinos', label: 'Treinos', icon: 'M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12' },
  { to: '/perfil', label: 'Perfil', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

function BottomNav() {
  return (
    <nav aria-label="Navegação principal" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-2xl">
        {NAV.map((n) => (
          <li key={n.to} className="flex-1">
            <NavLink to={n.to} end={n.to === '/'}
              className={({ isActive }) => cx('flex min-h-14 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] font-medium', isActive ? 'text-accent' : 'text-muted')}>
              {({ isActive }) => (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={n.icon} /></svg>
                  <span>{n.label}</span>
                  {isActive && <span className="sr-only">(página atual)</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function useTheme(settings: Settings | null | undefined) {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq?.addEventListener?.('change', fn);
    return () => mq?.removeEventListener?.('change', fn);
  }, []);
  useEffect(() => {
    const theme = settings?.theme ?? 'dark';
    const dark = theme === 'dark' || (theme === 'system' && systemDark);
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.classList.toggle('accent-blue', settings?.accent === 'blue');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1418' : '#f3f5f7');
  }, [settings?.theme, settings?.accent, systemDark]);
}

function Shell() {
  const settings = useLiveQuery(() => db.settings.get('app').then((s) => s ?? null), []);
  const profile = useLiveQuery(() => db.profile.get('me').then((p) => p ?? null), []);
  useTheme(settings);
  if (settings === undefined || profile === undefined) {
    return <div className="flex min-h-dvh items-center justify-center text-muted" role="status">Carregando…</div>;
  }
  if (!settings?.onboardingDone || !profile) return <Onboarding />;
  return (
    <SheetsProvider>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/evolucao" element={<Progress />} />
        <Route path="/alimentacao" element={<Nutrition />} />
        <Route path="/treinos" element={<Workouts />} />
        <Route path="/treinos/sessao" element={<LiveSession />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/checklist" element={<ChecklistPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </SheetsProvider>
  );
}

export function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <ScrollTop />
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}

function ScrollTop() {
  useEffect(() => {
    const fn = () => window.scrollTo(0, 0);
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return null;
}
