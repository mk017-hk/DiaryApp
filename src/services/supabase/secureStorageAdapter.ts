import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { logger } from '@/services/logger';

/**
 * Session storage for Supabase Auth, backed by the device keychain.
 *
 * AsyncStorage — the usual choice — writes plaintext to disk, which is the
 * wrong place for a token that unlocks someone's diary. SecureStore uses the
 * iOS keychain and Android keystore instead.
 *
 * The catch that makes this file necessary: SecureStore rejects values over
 * 2048 bytes, and a Supabase session carrying a JWT routinely exceeds that.
 * Storing it naively appears to work — writes fail quietly on some platforms
 * and the user is silently signed out on next launch. So values are split
 * across numbered chunks, with a small header recording how many there are.
 */

const CHUNK_SIZE = 1800; // headroom under the 2048-byte limit
const chunkKey = (key: string, index: number) => `${key}.${String(index)}`;

async function readChunkCount(key: string): Promise<number> {
  const header = await SecureStore.getItemAsync(key);
  if (header === null) return 0;

  const count = Number.parseInt(header, 10);
  return Number.isNaN(count) || count < 0 ? 0 : count;
}

async function clearChunks(key: string, count: number): Promise<void> {
  const deletions = Array.from({ length: count }, (_, index) =>
    SecureStore.deleteItemAsync(chunkKey(key, index)),
  );
  await Promise.all(deletions);
}

/**
 * The web preview has no keychain.
 *
 * `expo-secure-store` is native-only, so on web every write here failed and
 * was swallowed by the catch below — the app signed you in and forgot by the
 * next reload, with nothing on screen to say why. `npm run web` is how this
 * project gets looked at, and an auth flow that cannot be walked twice is not
 * much of a preview.
 *
 * So on web the session goes to localStorage, which is what a web app would
 * use anyway. It is worth being plain about the tradeoff: localStorage is
 * readable by any script on the origin, and it is not where a real diary's
 * session should live. It is acceptable here only because web is a layout
 * preview and never a shipping target — the app is iOS, and on iOS this is
 * the keychain.
 */
const webStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage.getItem(key);
    } catch (error) {
      logger.error('Failed to read stored session', { error });
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage.setItem(key, value);
    } catch (error) {
      logger.error('Failed to persist session', { error });
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage.removeItem(key);
    } catch (error) {
      logger.error('Failed to clear stored session', { error });
    }
  },
};

const isWeb = Platform.OS === 'web';

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (isWeb) return webStorage.getItem(key);

    try {
      const count = await readChunkCount(key);
      if (count === 0) return null;

      const parts = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(chunkKey(key, index))),
      );

      // A missing chunk means a torn write. A partial session is worse than
      // none — it would fail deep inside the auth client — so discard it and
      // let the user sign in again.
      if (parts.some((part) => part === null)) {
        logger.warn('Discarding incomplete stored session');
        await clearChunks(key, count);
        await SecureStore.deleteItemAsync(key);
        return null;
      }

      return parts.join('');
    } catch (error) {
      logger.error('Failed to read stored session', { error });
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (isWeb) return webStorage.setItem(key, value);

    try {
      // Remove any longer previous session first, or its trailing chunks
      // would be read back as part of the new one.
      await clearChunks(key, await readChunkCount(key));

      const chunks: string[] = [];
      for (let index = 0; index < value.length; index += CHUNK_SIZE) {
        chunks.push(value.slice(index, index + CHUNK_SIZE));
      }

      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk)),
      );

      // Header last: until it lands there is no session to half-read.
      await SecureStore.setItemAsync(key, String(chunks.length));
    } catch (error) {
      logger.error('Failed to persist session', { error });
    }
  },

  async removeItem(key: string): Promise<void> {
    if (isWeb) return webStorage.removeItem(key);

    try {
      await clearChunks(key, await readChunkCount(key));
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      logger.error('Failed to clear stored session', { error });
    }
  },
};
