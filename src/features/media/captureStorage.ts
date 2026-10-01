import { Directory, File, Paths } from 'expo-file-system';

import { logger } from '@/services/logger';

/**
 * Where photos and voice notes live on the device.
 *
 * The same rule as video: whatever the picker or recorder hands back sits in
 * the cache directory, which iOS is free to purge whenever storage runs low.
 * A diary entry whose photo quietly vanished a month later would be a bug
 * somebody discovers at exactly the wrong moment, so everything is moved into
 * the document directory the moment it is captured.
 */

const PHOTO_DIR = 'photos';
const AUDIO_DIR = 'audio';

function ensureDir(name: string): Directory {
  const dir = new Directory(Paths.document, name);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * The extension, read from the last path segment only.
 *
 * Reading it from the whole URI would take `folder/IMG_0001` as the extension
 * of `file:///my.folder/IMG_0001`, and name the stored file after it.
 */
function extensionOf(uri: string, fallback: string): string {
  const name = (uri.split('?')[0] ?? uri).split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return fallback;

  const found = name.slice(dot + 1);
  // Anything that is not a plain extension is not worth trusting as one.
  return /^[A-Za-z0-9]{1,5}$/.test(found) ? found.toLowerCase() : fallback;
}

/**
 * Moves a captured file somewhere durable.
 *
 * Named by the media id, which the device generated, so the file on disk and
 * the object in the bucket share a name and a retry overwrites rather than
 * duplicating.
 */
function persist(temporaryUri: string, dirName: string, mediaId: string, fallbackExt: string) {
  const dir = ensureDir(dirName);
  const extension = extensionOf(temporaryUri, fallbackExt);
  const destination = new File(dir, `${mediaId}.${extension}`);
  const source = new File(temporaryUri);

  try {
    source.move(destination);
  } catch (error) {
    // A move across volumes can fail where a copy succeeds.
    logger.warn('Could not move captured file; copying instead', { error });
    source.copy(destination);
  }

  return destination.uri;
}

export function persistPhoto(temporaryUri: string, mediaId: string): string {
  return persist(temporaryUri, PHOTO_DIR, mediaId, 'jpg');
}

export function persistVoiceNote(temporaryUri: string, mediaId: string): string {
  return persist(temporaryUri, AUDIO_DIR, mediaId, 'm4a');
}

/** Removes one file. Missing is not an error — it may already be gone. */
export function deleteCaptured(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    logger.warn('Could not delete a captured file', { error });
  }
}

/**
 * Removes every photo and voice note on this device.
 *
 * Runs alongside `deleteAllRecordings` on sign-out and account deletion. The
 * whole directory goes rather than a file at a time: an entry whose row failed
 * to save would otherwise leave its photo on disk with nothing pointing at it.
 */
export function deleteAllCaptured(): void {
  for (const name of [PHOTO_DIR, AUDIO_DIR]) {
    try {
      const dir = new Directory(Paths.document, name);
      if (dir.exists) dir.delete();
    } catch (error) {
      logger.warn('Could not clear captured files', { error });
    }
  }
}
