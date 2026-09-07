import { Directory, File, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

import { logger } from '@/services/logger';

/**
 * Where recorded video lives.
 *
 * `recordAsync` writes into the cache directory, which iOS is free to purge
 * whenever storage runs low. Leaving a diary there means videos quietly
 * disappearing weeks later with nothing to show the user — so the first thing
 * that happens after a recording stops is a move into the document directory,
 * which the system does not touch.
 *
 * A poster frame is grabbed at the same time. Timelines and calendars render
 * the poster, never the video: streaming a list of clips just to scroll would
 * be slow on the device and, once this is server-backed, expensive.
 */

const VIDEO_DIR = 'videos';
const POSTER_DIR = 'posters';

function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export interface StoredVideo {
  /** Permanent file URI, safe to keep in an entry. */
  uri: string;
  /** First-frame image, or undefined if extraction failed. */
  posterUri?: string;
  durationMs?: number;
}

/**
 * Moves a just-recorded clip somewhere durable and extracts a poster.
 *
 * Failing to make a poster is not failing to keep the video — the entry is
 * what matters, and a missing thumbnail is a cosmetic problem.
 */
export async function persistRecording(
  temporaryUri: string,
  entryId: string,
): Promise<StoredVideo> {
  const videos = ensureDir(VIDEO_DIR);
  const source = new File(temporaryUri);
  const extension = temporaryUri.split('.').pop() ?? 'mov';
  const destination = new File(videos, `${entryId}.${extension}`);

  try {
    source.move(destination);
  } catch (error) {
    // A move across volumes can fail where a copy succeeds.
    logger.warn('Could not move recording; copying instead', { error });
    source.copy(destination);
  }

  const stored: StoredVideo = { uri: destination.uri };

  try {
    const posters = ensureDir(POSTER_DIR);
    const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(destination.uri, {
      time: 0,
      quality: 0.6,
    });

    const poster = new File(posters, `${entryId}.jpg`);
    new File(thumbnailUri).move(poster);
    stored.posterUri = poster.uri;
  } catch (error) {
    logger.warn('Could not create a poster frame', { error });
  }

  return stored;
}

/** Removes a video and its poster. Missing files are not an error. */
export async function deleteRecording(entryId: string): Promise<void> {
  for (const [dir, extensions] of [
    [VIDEO_DIR, ['mov', 'mp4']],
    [POSTER_DIR, ['jpg']],
  ] as const) {
    for (const extension of extensions) {
      try {
        const file = new File(new Directory(Paths.document, dir), `${entryId}.${extension}`);
        if (file.exists) file.delete();
      } catch (error) {
        logger.warn('Could not delete media', { error });
      }
    }
  }
}

/**
 * Removes every recording and poster on this device.
 *
 * Signing out and deleting an account both have to leave nothing behind. The
 * whole directory goes rather than a file per entry: an entry whose row failed
 * to save would otherwise leave its video sitting on disk with nothing left
 * pointing at it, which is the one case where a leftover is most likely.
 */
export async function deleteAllRecordings(): Promise<void> {
  for (const name of [VIDEO_DIR, POSTER_DIR]) {
    try {
      const dir = new Directory(Paths.document, name);
      if (dir.exists) dir.delete();
    } catch (error) {
      logger.warn('Could not clear media', { error });
    }
  }
}

/** Whether the file an entry points at is still on disk. */
export function recordingExists(uri: string | undefined): boolean {
  if (uri === undefined) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}
