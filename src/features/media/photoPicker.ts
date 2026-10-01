import * as ImagePicker from 'expo-image-picker';

import { logger } from '@/services/logger';

/**
 * Choosing photos for an entry.
 *
 * The library rather than the camera: a diary photo is usually one you already
 * took — the thing you noticed, the person you were with — rather than one you
 * stage for the app. The camera is still there for video, which is the format
 * this product is actually built around.
 *
 * Nothing is uploaded here. The picker hands back files in a temporary place
 * and the caller moves them somewhere durable, exactly as video does.
 */

/** Four is plenty for a day. More is an album, not a diary page. */
const MAX_PHOTOS = 4;

export async function pickPhotos(remaining = MAX_PHOTOS): Promise<string[]> {
  if (remaining <= 0) return [];

  try {
    // iOS 14+ shows its own limited-library picker and never asks for full
    // access, which is the right default: this app has no business reading a
    // whole camera roll to let somebody attach one picture.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      // Compressed on the way in. A modern phone photo is several megabytes
      // and this archive is never deleted, so the saving compounds.
      quality: 0.8,
      // Stripped, deliberately. A diary should not quietly carry the GPS
      // coordinates of where every photo was taken.
      exif: false,
    });

    if (result.canceled) return [];
    return result.assets.slice(0, remaining).map((asset) => asset.uri);
  } catch (error) {
    logger.error('Could not open the photo library', { error });
    return [];
  }
}

export { MAX_PHOTOS };
