import { Directory, File, Paths } from 'expo-file-system';

import { logger } from '@/services/logger';

import { buildArchive, renderArchiveHtml, type ArchiveInput } from './archive';

/**
 * Putting the export on the disk.
 *
 * Two files, written somewhere the share sheet can pick them up: a JSON archive
 * another program could read, and a page that opens in any browser with no app
 * and no network.
 *
 * The media is not copied in beside them, and that is a decision rather than an
 * omission. The folder would have to be reachable to be worth anything, and the
 * only way to make a folder reachable on iOS exposes the whole documents
 * directory — which is where the diary's own recordings live. See the note in
 * `app.config.ts`. Media leaves through the photo library instead, in
 * `saveMedia.ts`, which is somewhere she can already get at.
 *
 * So the archive lists every file, says which are on this phone and which are
 * only in the account, and the page explains in words where a missing one went
 * rather than showing a broken image.
 */

const FOLDER = 'export';

export interface WrittenArchive {
  /** The folder, as a uri. */
  directory: string;
  /** The page to open, and the one worth sharing on its own. */
  htmlPath: string;
  jsonPath: string;
  /** Media files this phone holds, which `saveMediaToLibrary` can get out. */
  mediaOnPhone: number;
  /** Media only in the account, listed in the archive but not here. */
  mediaRemoteOnly: number;
}

/**
 * Writes the archive, replacing any previous one.
 *
 * Replacing rather than accumulating: two exports a month apart would otherwise
 * leave the older one on the phone forever, which is both a waste of a device
 * and a second copy of a diary nobody remembers making.
 */
export function writeArchive(input: ArchiveInput): WrittenArchive {
  const archive = buildArchive(input);

  const root = new Directory(Paths.document, FOLDER);
  if (root.exists) root.delete();
  root.create({ intermediates: true });

  const json = new File(root, 'diary.json');
  json.create();
  json.write(JSON.stringify(archive, null, 2));

  const html = new File(root, 'diary.html');
  html.create();
  html.write(renderArchiveHtml(archive));

  let onPhone = 0;
  let remoteOnly = 0;

  for (const entry of input.entries) {
    if (entry.deletedAt !== undefined) continue;
    for (const item of entry.media) {
      if (item.uri !== undefined) onPhone += 1;
      else remoteOnly += 1;
    }
  }

  return {
    directory: root.uri,
    htmlPath: html.uri,
    jsonPath: json.uri,
    mediaOnPhone: onPhone,
    mediaRemoteOnly: remoteOnly,
  };
}

/** Removes a previous export, so a copy of the diary is not left lying around. */
export function clearArchive(): void {
  try {
    const root = new Directory(Paths.document, FOLDER);
    if (root.exists) root.delete();
  } catch (error) {
    logger.warn('Could not clear a previous export', { error });
  }
}
