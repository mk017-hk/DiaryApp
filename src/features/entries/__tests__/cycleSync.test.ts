import AsyncStorage from '@react-native-async-storage/async-storage';

import { getDayLog, saveDayLog, unsyncedDayLogs, type DayLog } from '@/features/cycle/dayLogStore';

import {
  __testing,
  resetSyncState,
  syncEntries,
  type RemoteResult,
  type SyncRemote,
} from '../sync';

/**
 * Cycle days in a sync pass, against a fake account.
 */

const failure = { kind: 'network', userMessage: 'offline' } as never;

class FakeRemote implements SyncRemote {
  pushedDays: DayLog[][] = [];
  pulledSince: (string | null)[] = [];
  pushDays: ((logs: DayLog[]) => RemoteResult<DayLog[]>) | null = null;
  pullDays: RemoteResult<{ logs: DayLog[]; watermark: string | null }> = {
    ok: true,
    value: { logs: [], watermark: null },
  };

  push = () => Promise.resolve({ ok: true as const, value: { accepted: [], deleted: [] } });
  pull = () => Promise.resolve({ ok: true as const, value: { entries: [], watermark: null } });

  pushCycleDays(logs: DayLog[]) {
    this.pushedDays.push(logs);
    return Promise.resolve(this.pushDays?.(logs) ?? { ok: true as const, value: logs });
  }

  pullCycleDays(since: string | null) {
    this.pulledSince.push(since);
    return Promise.resolve(this.pullDays);
  }
}

const remoteDay = (over: Partial<DayLog> = {}): DayLog => ({
  date: '2026-11-01',
  period: true,
  flow: 'heavy',
  symptoms: [],
  moods: [],
  intimacy: [],
  updatedAt: '2999-01-01T00:00:00.000Z',
  unsynced: false,
  ...over,
});

let remote: FakeRemote;

beforeEach(async () => {
  await AsyncStorage.clear();
  __testing.reset();
  remote = new FakeRemote();
});

it('sends days logged here, once', async () => {
  await saveDayLog('2026-11-01', { flow: 'light' });

  await syncEntries(remote);
  await syncEntries(remote);

  expect(remote.pushedDays).toHaveLength(1);
  expect(await unsyncedDayLogs()).toEqual([]);
});

it('keeps a day queued when the account cannot be reached', async () => {
  await saveDayLog('2026-11-01', { flow: 'light' });
  remote.pushDays = () => ({ ok: false, error: failure });

  await syncEntries(remote);

  expect(await unsyncedDayLogs()).toHaveLength(1);
});

it('takes the account’s newer version of a day it sends', async () => {
  await saveDayLog('2026-11-01', { flow: 'light' });
  remote.pushDays = () => ({ ok: true, value: [remoteDay()] });

  await syncEntries(remote);

  expect(await getDayLog('2026-11-01')).toMatchObject({ flow: 'heavy', unsynced: false });
});

it('pulls from its own watermark, and saves the new one only after the rows land', async () => {
  remote.pullDays = { ok: true, value: { logs: [remoteDay()], watermark: 'W1' } };
  await syncEntries(remote);
  expect(remote.pulledSince).toEqual([null]);
  expect((await getDayLog('2026-11-01')).flow).toBe('heavy');

  remote.pullDays = { ok: false, error: failure };
  await syncEntries(remote);
  remote.pullDays = { ok: true, value: { logs: [], watermark: null } };
  await syncEntries(remote);

  // A failed pull moved nothing; the last good watermark is still the one used.
  expect(remote.pulledSince).toEqual([null, 'W1', 'W1']);
});

it('forgets the watermark with the rest of the sync state', async () => {
  remote.pullDays = { ok: true, value: { logs: [], watermark: 'W1' } };
  await syncEntries(remote);
  await resetSyncState();
  await syncEntries(remote);
  expect(remote.pulledSince).toEqual([null, null]);
});
