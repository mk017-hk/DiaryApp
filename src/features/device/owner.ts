import AsyncStorage from '@react-native-async-storage/async-storage';

import { logger } from '@/services/logger';

/**
 * Whose diary is on this phone.
 *
 * Everything this app keeps — entries, threads, letters, quiet dates, the
 * recordings themselves — is stored on the device first and pushed afterwards.
 * None of it records which account it belongs to, because while there was one
 * account per phone there was nothing to tell apart.
 *
 * That stops being true the moment real people have real accounts. A session
 * can end without anybody tapping Sign out: the account is deleted from another
 * phone, a password is reset elsewhere and every other session revoked. When
 * that happens the diary is still sitting here, the app is back on the welcome
 * screen, and the next person to sign in would be shown it. Worse, the sync
 * engine stamps the author from the *current* session, so anything the first
 * person had not yet sent would be uploaded into the second person's account.
 *
 * So the device remembers whose data it holds, and a different account signing
 * in finds an empty diary rather than somebody else's.
 */

const KEY = 'device.owner.v1';

export type Ownership =
  /** The signed-in account is the one whose diary this is. */
  | 'mine'
  /** Nobody has claimed this device yet. The signed-in account takes it. */
  | 'claim'
  /** Somebody else's diary is here. It goes before anything is shown. */
  | 'wipe';

/**
 * What to do about the data on this device, given who has just signed in.
 *
 * `claim` covers two cases and both are right. A fresh install has nothing to
 * hand over. A phone upgrading from a build before this existed has a diary
 * and no record of whose — and the person signed in when the upgrade lands is,
 * in every ordinary case, the person who wrote it.
 */
export function decideOwnership(stored: string | null, signedIn: string): Ownership {
  if (stored === signedIn) return 'mine';
  if (stored === null) return 'claim';
  return 'wipe';
}

export async function readOwner(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch (error) {
    // Rethrown rather than returned as null, because null means "nobody" and
    // would become a claim. Unknown is neither: the gate answers it by showing
    // nothing and destroying nothing, since wiping on a transient read error
    // could cost the rightful owner the entries they have not sent yet.
    logger.error('Could not read whose diary is on this device', { error });
    throw error;
  }
}

export async function claimOwner(userId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, userId);
}

export async function forgetOwner(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export const OWNER_KEY = KEY;
