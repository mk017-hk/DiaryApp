import AsyncStorage from '@react-native-async-storage/async-storage';

import { __testing, clearProfile, EMPTY_PROFILE, loadProfile, saveProfile } from '../profileStore';

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

describe('keeping a profile between launches', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('reads back what it wrote', async () => {
    const profile = {
      ...EMPTY_PROFILE,
      name: 'James',
      intentions: ['through' as const],
      tone: 'warm' as const,
      onboardedAt: '2026-09-06T18:00:00.000Z',
    };

    await saveProfile(profile);

    expect(await loadProfile()).toEqual(profile);
  });

  it('starts empty when nothing has been written', async () => {
    expect(await loadProfile()).toEqual(EMPTY_PROFILE);
  });

  // The keychain holds secrets; a name and a tone are not among them, so this
  // is the ordinary store. Asserting the key is here to catch a silent change
  // of storage that would strand every existing profile.
  it('writes under the versioned key', async () => {
    await saveProfile({ ...EMPTY_PROFILE, name: 'James' });

    const raw = await AsyncStorage.getItem('profile.v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toMatchObject({ name: 'James' });
  });

  // Signing out has to leave nothing for the next person to sign in and find.
  it('leaves nothing behind when cleared', async () => {
    await saveProfile({ ...EMPTY_PROFILE, name: 'James', onboardedAt: '2026-09-06T18:00:00.000Z' });
    await clearProfile();

    expect(await AsyncStorage.getItem('profile.v1')).toBeNull();
    expect(await loadProfile()).toEqual(EMPTY_PROFILE);
  });

  it('survives a stored profile that is not valid JSON', async () => {
    await AsyncStorage.setItem('profile.v1', 'not json at all');

    expect(await loadProfile()).toEqual(EMPTY_PROFILE);
  });
});
