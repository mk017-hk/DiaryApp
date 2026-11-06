import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyRemoteDayLogs,
  getDayLog,
  listDayLogs,
  loadCycleSettings,
  markDayLogsSynced,
  saveCycleSettings,
  saveDayLog,
  setPeriodDays,
  unsyncedDayLogs,
} from '../dayLogStore';
import { byPhase, topSymptoms } from '../insights';
import { periodsFrom, summarise, DEFAULT_CYCLE_SETTINGS } from '../cycleMath';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('logging a day', () => {
  it('keeps what was logged and nothing else', async () => {
    await saveDayLog('2026-03-01', { symptoms: ['cramps'], water: 6 });
    expect(await getDayLog('2026-03-01')).toMatchObject({
      date: '2026-03-01',
      symptoms: ['cramps'],
      water: 6,
      period: false,
      unsynced: true,
    });
  });

  it('marks a period day when a flow is logged', async () => {
    await saveDayLog('2026-03-01', { flow: 'medium' });
    expect((await getDayLog('2026-03-01')).period).toBe(true);
  });

  it('does not count spotting as a period', async () => {
    await saveDayLog('2026-03-01', { flow: 'spotting' });
    expect((await getDayLog('2026-03-01')).period).toBe(false);
  });

  it('clears the flow when the period is unmarked', async () => {
    await saveDayLog('2026-03-01', { flow: 'heavy' });
    await saveDayLog('2026-03-01', { period: false });
    const log = await getDayLog('2026-03-01');
    expect(log.period).toBe(false);
    expect(log.flow).toBeUndefined();
  });

  it('clears a field set to undefined, rather than storing the key', async () => {
    await saveDayLog('2026-03-01', { energy: 'low' });
    await saveDayLog('2026-03-01', { energy: undefined });
    expect('energy' in (await getDayLog('2026-03-01'))).toBe(false);
  });

  it('treats "nothing to note" and a symptom as either-or, newest tap first', async () => {
    await saveDayLog('2026-03-01', { symptoms: ['cramps', 'none'] });
    expect((await getDayLog('2026-03-01')).symptoms).toEqual(['none']);
    await saveDayLog('2026-03-01', { symptoms: ['none', 'headache'] });
    expect((await getDayLog('2026-03-01')).symptoms).toEqual(['headache']);
  });

  it('does not lose a tap to a second one made before the first has saved', async () => {
    await Promise.all([
      saveDayLog('2026-03-01', { water: 3 }),
      saveDayLog('2026-03-01', { energy: 'high' }),
    ]);
    expect(await getDayLog('2026-03-01')).toMatchObject({ water: 3, energy: 'high' });
  });

  it('lists only days with something on them', async () => {
    await saveDayLog('2026-03-02', { water: 2 });
    await saveDayLog('2026-03-01', { energy: 'low' });
    await saveDayLog('2026-03-01', { energy: undefined });
    expect((await listDayLogs()).map((log) => log.date)).toEqual(['2026-03-02']);
  });
});

describe('editing the period on the calendar', () => {
  it('marks and unmarks several days in one go', async () => {
    await setPeriodDays({ on: ['2026-03-01', '2026-03-02', '2026-03-03'], off: [] });
    await setPeriodDays({ on: [], off: ['2026-03-03'] });
    const marked = (await listDayLogs()).filter((log) => log.period).map((log) => log.date);
    expect(marked).toEqual(['2026-03-01', '2026-03-02']);
  });

  it('keeps the rest of a day when only the period is unmarked', async () => {
    await saveDayLog('2026-03-01', { flow: 'light', symptoms: ['cramps'] });
    await setPeriodDays({ on: [], off: ['2026-03-01'] });
    expect(await getDayLog('2026-03-01')).toMatchObject({ period: false, symptoms: ['cramps'] });
  });
});

describe('sync bookkeeping', () => {
  it('reports emptied days as unsynced, so the account hears they are empty', async () => {
    await saveDayLog('2026-03-01', { water: 2 });
    await saveDayLog('2026-03-01', { water: undefined });
    expect((await unsyncedDayLogs()).map((log) => log.date)).toEqual(['2026-03-01']);
  });

  it('does not mark a newer edit as synced', async () => {
    const sent = await saveDayLog('2026-03-01', { water: 2 });
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveDayLog('2026-03-01', { water: 3 });
    await markDayLogsSynced([{ date: sent.date, updatedAt: sent.updatedAt }]);
    expect(await unsyncedDayLogs()).toHaveLength(1);
  });

  it('takes the account’s version only when it is newer', async () => {
    const local = await saveDayLog('2026-03-01', { water: 2 });
    const older = { ...local, water: 9, updatedAt: '2000-01-01T00:00:00.000Z' };
    const newer = { ...local, water: 5, updatedAt: '2999-01-01T00:00:00.000Z' };

    expect(await applyRemoteDayLogs([older])).toBe(0);
    expect((await getDayLog('2026-03-01')).water).toBe(2);

    expect(await applyRemoteDayLogs([newer])).toBe(1);
    expect(await getDayLog('2026-03-01')).toMatchObject({ water: 5, unsynced: false });
  });
});

describe('settings', () => {
  it('starts switched off, with the usual defaults', async () => {
    expect(await loadCycleSettings()).toEqual(DEFAULT_CYCLE_SETTINGS);
  });

  it('keeps what is changed and nothing else', async () => {
    await saveCycleSettings({ enabled: true, cycleLength: 31 });
    expect(await loadCycleSettings()).toMatchObject({
      enabled: true,
      cycleLength: 31,
      periodLength: 5,
    });
  });
});

describe('insights', () => {
  it('ranks symptoms and leaves out "nothing to note"', async () => {
    await saveDayLog('2026-03-01', { symptoms: ['cramps', 'headache'] });
    await saveDayLog('2026-03-02', { symptoms: ['cramps'] });
    await saveDayLog('2026-03-03', { symptoms: ['none'] });
    expect(topSymptoms(await listDayLogs())).toEqual([
      { id: 'cramps', count: 2 },
      { id: 'headache', count: 1 },
    ]);
  });

  it('says nothing about a phase with too few days behind it', async () => {
    await setPeriodDays({ on: ['2026-03-01', '2026-03-02', '2026-03-03'], off: [] });
    await saveDayLog('2026-03-01', { moods: ['sad'] });
    await saveDayLog('2026-03-02', { moods: ['sad'] });
    await saveDayLog('2026-03-20', { moods: ['calm'] });

    const logs = await listDayLogs();
    const periods = periodsFrom(logs.filter((l) => l.period).map((l) => l.date));
    const phases = byPhase(logs, [], periods, summarise(periods, DEFAULT_CYCLE_SETTINGS));

    expect(phases.map((p) => p.phase)).toEqual(['period']);
    expect(phases[0]?.moods).toEqual([{ id: 'sad', count: 2 }]);
  });
});
