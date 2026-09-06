import AsyncStorage from '@react-native-async-storage/async-storage';

import { __testing, EMPTY_PROFILE, loadProfile, saveProfile } from '../profileStore';

const { migrate } = __testing;

describe('reading a stored profile', () => {
  it('reads the current shape', () => {
    expect(
      migrate({
        name: 'James',
        intentions: ['through', 'change'],
        tone: 'warm',
        capture: 'write',
        onboardedAt: '2026-09-06T18:00:00.000Z',
      }),
    ).toEqual({
      name: 'James',
      intentions: ['through', 'change'],
      tone: 'warm',
      capture: 'write',
      onboardedAt: '2026-09-06T18:00:00.000Z',
    });
  });

  // Someone who already onboarded must not be dragged back through it just
  // because the schema grew underneath them.
  it('carries a profile written before tone and multi-select existed', () => {
    const migrated = migrate({
      name: 'James',
      intention: 'Watch myself change',
      onboardedAt: '2026-09-06T18:00:00.000Z',
    });

    expect(migrated.name).toEqual('James');
    expect(migrated.intentions).toEqual(['change']);
    expect(migrated.onboardedAt).toEqual('2026-09-06T18:00:00.000Z');
    expect(migrated.tone).toEqual('gentle');
    expect(migrated.capture).toEqual('either');
  });

  it('drops an old intention label that no longer maps to anything', () => {
    expect(migrate({ name: 'James', intention: 'Something removed' }).intentions).toEqual([]);
  });

  it('rejects values that are not real options', () => {
    const migrated = migrate({
      name: 'James',
      intentions: ['through', 'nonsense'],
      tone: 'shouty',
      capture: 'telepathy',
    });

    expect(migrated.intentions).toEqual(['through']);
    expect(migrated.tone).toEqual('gentle');
    expect(migrated.capture).toEqual('either');
  });

  it('survives a profile with nothing useful in it', () => {
    expect(migrate({})).toEqual(EMPTY_PROFILE);
  });
});

// Persistence is deliberately off while onboarding is being shaped, so the
// flow can be walked through on every launch. When PERSIST_PROFILE is flipped
// back on, these two expectations are what needs updating.
describe('while profiles are not being saved', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('writes nothing', async () => {
    await saveProfile({ ...EMPTY_PROFILE, name: 'James', onboardedAt: new Date().toISOString() });

    expect(await AsyncStorage.getItem('profile.v1')).toBeNull();
  });

  it('starts empty, and clears anything an earlier build left behind', async () => {
    await AsyncStorage.setItem('profile.v1', JSON.stringify({ name: 'James', tone: 'warm' }));

    expect(await loadProfile()).toEqual(EMPTY_PROFILE);
    expect(await AsyncStorage.getItem('profile.v1')).toBeNull();
  });
});
