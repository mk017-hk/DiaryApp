import { requireOptionalNativeModule } from 'expo';

/**
 * The audio-extract native module, when this build has it.
 *
 * Null in Expo Go and on the web, which do not carry custom native code. A
 * build made with `npx expo run:ios` does.
 */
interface AudioExtractModule {
  /** Resolves to the file URI of an .m4a holding the recording's sound. */
  extractAudioAsync(sourceUri: string): Promise<string>;
}

export const AudioExtract = requireOptionalNativeModule<AudioExtractModule>('AudioExtract');
