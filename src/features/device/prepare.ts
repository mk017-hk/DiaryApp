import { logger } from '@/services/logger';

import { claimOwner, decideOwnership, readOwner } from './owner';
import { wipeDiaryFromDevice } from './wipe';

/**
 * Making this phone ready for the account that has just signed in.
 *
 * Called by the session provider *before* it reports anyone as signed in, so
 * while this runs the app is still showing the sign-in screen, the sync engine
 * sees no user, and no screen has asked for an entry. That ordering is the
 * whole design. A version that let the session through and cleaned up after
 * would be racing a sync pass that stamps the new person as the author of the
 * previous person's unsent entries.
 *
 * Three outcomes. Usually the diary is already theirs and this costs one
 * storage read. A first sign-in claims the device. A different account wipes it
 * first — silently, because telling the new person that somebody else kept a
 * diary on this phone is itself something they have no business knowing.
 *
 * Returns false if ownership could not be settled, and the session provider
 * then refuses to report a signed-in user at all. That fails closed in both
 * directions: nothing of the previous diary is shown, and nothing of it is
 * destroyed on the strength of a storage read that did not work.
 */
export async function prepareDeviceFor(
  userId: string,
  options: {
    /**
     * Replaces the profile — the name, the tone, the preferences — with one
     * belonging to the new account. Passed in because the profile lives in a
     * provider's state as well as in storage.
     */
    replaceProfile: () => Promise<void>;
  },
): Promise<boolean> {
  try {
    const decision = decideOwnership(await readOwner(), userId);

    if (decision === 'wipe') {
      const outcome = await wipeDiaryFromDevice({ resetProfile: options.replaceProfile });
      // Claiming after a partial wipe would declare the leftovers this
      // person's, and the next launch would have no reason to try again.
      if (!outcome.complete) return false;
    }

    if (decision !== 'mine') await claimOwner(userId);
    return true;
  } catch (error) {
    logger.error('Could not settle whose diary is on this device', { error });
    return false;
  }
}
