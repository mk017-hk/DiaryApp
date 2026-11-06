import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { toDateKey } from '@/lib/date';

import {
  cycleOn,
  DEFAULT_CYCLE_SETTINGS,
  periodsFrom,
  summarise,
  type CycleDay,
  type CycleSettings,
  type CycleSummary,
  type Period,
} from './cycleMath';
import {
  listDayLogs,
  loadCycleSettings,
  saveCycleSettings,
  subscribeToDayLogs,
  type DayLog,
} from './dayLogStore';

interface CycleContextValue {
  ready: boolean;
  settings: CycleSettings;
  /** Every day with something logged, by date. */
  logs: Map<string, DayLog>;
  periodDays: Set<string>;
  periods: Period[];
  summary: CycleSummary;
  /** The date key the figures below were computed for. */
  today: string;
  now: CycleDay;
  updateSettings: (changes: Partial<CycleSettings>) => Promise<void>;
}

const CycleContext = createContext<CycleContextValue | null>(null);

/**
 * The cycle, worked out once and shared.
 *
 * Several screens show the same figures — Today's ring, the calendar's marks,
 * the insights — and each recomputing from storage on focus would let them
 * disagree for a moment after a log. One provider, recomputed whenever a log
 * changes, means a period marked on the calendar is already reflected on Today
 * by the time she gets there.
 *
 * Today's date is re-read when the app comes back to the foreground, so a phone
 * left open overnight does not greet her with yesterday's cycle day.
 */
export function CycleProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<CycleSettings>(DEFAULT_CYCLE_SETTINGS);
  const [logList, setLogList] = useState<DayLog[]>([]);
  const [today, setToday] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void Promise.all([loadCycleSettings(), listDayLogs()]).then(
        ([loadedSettings, loadedLogs]) => {
          if (cancelled) return;
          setSettings(loadedSettings);
          setLogList(loadedLogs);
          setToday(toDateKey(new Date()));
          setReady(true);
        },
      );
    };

    load();
    const unsubscribe = subscribeToDayLogs(load);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(toDateKey(new Date()));
    });
    return () => {
      cancelled = true;
      unsubscribe();
      appState.remove();
    };
  }, []);

  const updateSettings = useCallback(async (changes: Partial<CycleSettings>) => {
    setSettings(await saveCycleSettings(changes));
  }, []);

  const value = useMemo<CycleContextValue>(() => {
    const logs = new Map(logList.map((log) => [log.date, log]));
    const periodDays = new Set(logList.filter((log) => log.period).map((log) => log.date));
    const periods = periodsFrom(periodDays);
    const summary = summarise(periods, settings);
    return {
      ready,
      settings,
      logs,
      periodDays,
      periods,
      summary,
      today,
      now: cycleOn(today, periods, summary),
      updateSettings,
    };
  }, [ready, settings, logList, today, updateSettings]);

  return <CycleContext.Provider value={value}>{children}</CycleContext.Provider>;
}

export function useCycle(): CycleContextValue {
  const context = useContext(CycleContext);
  if (context === null) throw new Error('useCycle must be used inside a <CycleProvider>');
  return context;
}
