// The legacy entry point, deliberately. SDK 57 ships a new class-based API
// alongside it; the functions this needs — create an asset, put it in an album —
// are the legacy ones, and mixing the two gives two incompatible `Asset` types.
import * as MediaLibrary from 'expo-media-library/legacy';

import type { Entry } from '@/features/entries';
import { logger } from '@/services/logger';

/**
 * Getting the videos and photos out.
 *
 * The text half of an export leaves through the share sheet, which handles a
 * file nicely. The media half cannot: it is gigabytes, there may be hundreds of
 * files, and iOS has no "share this folder".
 *
 * The obvious fix is `UIFileSharingEnabled`, and it is the wrong one — see the
 * note in `app.config.ts`. It would expose the directory the diary's own
 * recordings live in to anyone who plugs the phone into a computer, which is
 * what the PIN exists to prevent. An export is worth a lot; it is not worth
 * that.
 *
 * So media leaves through the photo library, which is the one place on a phone
 * somebody already knows how to reach, already backs up, and already trusts
 * with exactly this kind of thing. An album named after the app, so it arrives
 * somewhere rather than scattered through the camera roll by date.
 */

const ALBUM = 'Diary';

export interface SavedMedia {
  saved: number;
  /** Files this device did not hold, so could not be saved. */
  missing: number;
  failed: number;
}

export type SaveOutcome =
  { ok: true; value: SavedMedia } | { ok: false; reason: 'denied' | 'unavailable' };

/**
 * Saves every photo and video the device holds into an album.
 *
 * Voice notes are left out, and not by oversight: the photo library has nowhere
 * to put an audio file, and silently dropping them would be worse than saying
 * so. They are in the archive's manifest and can be shared one at a time.
 */
export async function saveMediaToLibrary(entries: Entry[]): Promise<SaveOutcome> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return { ok: false, reason: 'denied' };

  const wanted = entries
    .filter((entry) => entry.deletedAt === undefined)
    .flatMap((entry) => entry.media)
    .filter((item) => item.kind === 'photo' || item.kind === 'video');

  let saved = 0;
  let missing = 0;
  let failed = 0;
  const assets: MediaLibrary.Asset[] = [];

  for (const item of wanted) {
    if (item.uri === undefined) {
      missing += 1;
      continue;
    }

    try {
      assets.push(await MediaLibrary.createAssetAsync(item.uri));
      saved += 1;
    } catch (error) {
      // One unreadable file must not cost her the other four hundred.
      logger.warn('Could not save a file to the library', { error });
      failed += 1;
    }
  }

  if (assets.length > 0) {
    try {
      const album = await MediaLibrary.getAlbumAsync(ALBUM);
      if (album === null) await MediaLibrary.createAlbumAsync(ALBUM, assets[0], false);
      else await MediaLibrary.addAssetsToAlbumAsync(assets, album, false);
    } catch (error) {
      // The files are saved either way; only the tidying failed, and telling
      // her the export went wrong because an album did not get made would be
      // alarming about nothing.
      logger.warn('Saved the files but could not put them in an album', { error });
    }
  }

  return { ok: true, value: { saved, missing, failed } };
}

/** How many files such a save would cover, for saying so before asking. */
export function mediaWorthSaving(entries: Entry[]): number {
  return entries
    .filter((entry) => entry.deletedAt === undefined)
    .flatMap((entry) => entry.media)
    .filter((item) => (item.kind === 'photo' || item.kind === 'video') && item.uri !== undefined)
    .length;
}
