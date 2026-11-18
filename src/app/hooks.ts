import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db, dbErrorMessage } from '../data/db';
import { defaultSettings } from '../data/seed';
import { DEFAULT_TZ, todayISO } from '../domain/dates';
import { useToast } from '../components/ui';

export function useSettings() {
  return useLiveQuery(() => db.settings.get('app'), []) ?? null;
}

export function useSettingsOrDefault() {
  const s = useSettings();
  return s ?? defaultSettings(new Date().toISOString());
}

export function useProfile() {
  return useLiveQuery(() => db.profile.get('me'), []);
}

/** Data de hoje no fuso configurado; atualiza ao voltar ao app e a cada minuto. */
export function useToday(): string {
  const s = useSettings();
  const tz = s?.timeZone ?? DEFAULT_TZ;
  const [today, setToday] = useState(() => todayISO(tz));
  useEffect(() => {
    const update = () => setToday(todayISO(tz));
    update();
    const iv = setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', update); };
  }, [tz]);
  return today;
}

/** Executa uma gravação com feedback visível e opção de tentar novamente. */
export function useSave() {
  const { show } = useToast();
  return useCallback(async function run<T>(fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> {
    try {
      const r = await fn();
      if (okMessage) show(okMessage, 'ok');
      return r;
    } catch (e) {
      console.error(e);
      show(dbErrorMessage(e), 'error', { label: 'Tentar de novo', run: () => { void run(fn, okMessage); } });
      return undefined;
    }
  }, [show]);
}
