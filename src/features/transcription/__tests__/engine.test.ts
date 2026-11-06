/**
 * Transcription, against fake native modules.
 *
 * The real ones only exist in a build made on a Mac. What can be pinned down
 * here is everything around them: that the app survives their absence, that a
 * video goes through the audio copy and the copy is always deleted, that the
 * words are put together in order, and that silence is not a failure.
 */

type Listener = (event?: unknown) => void;

const mockListeners = new Map<string, Listener>();
const mockStart = jest.fn();
const mockExtract = jest.fn((_uri: string) => Promise.resolve('file:///tmp/transcribe-1.m4a'));
const mockDelete = jest.fn();
let mockHasModules = true;

const mockSpeech = {
  start: (options: unknown) => mockStart(options),
  abort: jest.fn(),
  isRecognitionAvailable: () => true,
  supportsOnDeviceRecognition: () => true,
  getSpeechRecognizerPermissionsAsync: () => Promise.resolve({ granted: true, canAskAgain: true }),
  requestSpeechRecognizerPermissionsAsync: () =>
    Promise.resolve({ granted: true, canAskAgain: true }),
  addListener: (event: string, listener: Listener) => {
    mockListeners.set(event, listener);
    return { remove: () => mockListeners.delete(event) };
  },
};

jest.mock('expo', () => ({
  requireOptionalNativeModule: (name: string) => {
    if (!mockHasModules) return null;
    if (name === 'ExpoSpeechRecognition') return mockSpeech;
    if (name === 'AudioExtract') return { extractAudioAsync: (uri: string) => mockExtract(uri) };
    return null;
  },
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, delete: () => mockDelete(uri) })),
}));

const emit = (event: string, payload?: unknown) => mockListeners.get(event)?.(payload);
const result = (transcript: string, isFinal: boolean) => ({
  isFinal,
  results: [{ transcript, confidence: 0.9, segments: [] }],
});

/** Loads the engine fresh, so the module check at import sees the current mocks. */
function engine(): typeof import('../engine') {
  let loaded: typeof import('../engine') | undefined;
  jest.isolateModules(() => {
    // isolateModules needs a synchronous load, so the module check at import
    // time sees this test's mocks rather than the previous test's.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../engine') as typeof import('../engine');
  });
  return loaded!;
}

beforeEach(() => {
  mockListeners.clear();
  mockStart.mockReset();
  mockExtract.mockClear();
  mockDelete.mockClear();
  mockHasModules = true;
});

it('reports that it needs the full build where the modules are missing, as in Expo Go', () => {
  mockHasModules = false;
  expect(engine().canTranscribeHere()).toEqual({ available: false, reason: 'needs-full-build' });
});

it('is available where both modules are present and recognition runs on the phone', () => {
  expect(engine().canTranscribeHere()).toEqual({ available: true });
});

it('asks for recognition on the phone only, never over the network', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///voice.m4a', 'audio');
  await Promise.resolve();
  emit('end');
  await done;
  expect(mockStart).toHaveBeenCalledWith(
    expect.objectContaining({
      requiresOnDeviceRecognition: true,
      audioSource: { uri: 'file:///voice.m4a' },
    }),
  );
});

it('puts the final results together in order, keeping a last stretch that only came interim', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///voice.m4a', 'audio');
  await Promise.resolve();
  emit('result', result('Today was long', true));
  emit('result', result('but the walk', false));
  emit('result', result('but the walk home was lovely', true));
  emit('result', result('and then', false));
  emit('end');
  expect(await done).toBe('Today was long but the walk home was lovely and then');
});

it('copies the sound out of a video first, and deletes the copy afterwards', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///clip.mov', 'video');
  await new Promise((resolve) => setTimeout(resolve, 0));
  emit('result', result('hello', true));
  emit('end');
  await done;

  expect(mockExtract).toHaveBeenCalledWith('file:///clip.mov');
  expect(mockStart).toHaveBeenCalledWith(
    expect.objectContaining({ audioSource: { uri: 'file:///tmp/transcribe-1.m4a' } }),
  );
  expect(mockDelete).toHaveBeenCalledWith('file:///tmp/transcribe-1.m4a');
});

it('deletes the copy even when recognition fails', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///clip.mov', 'video');
  await new Promise((resolve) => setTimeout(resolve, 0));
  emit('error', { error: 'audio-capture', message: 'broken' });
  await expect(done).rejects.toThrow('audio-capture');
  expect(mockDelete).toHaveBeenCalled();
});

it('treats a clip with no words in it as an empty transcript, not a failure', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///voice.m4a', 'audio');
  await Promise.resolve();
  emit('error', { error: 'no-speech', message: '' });
  expect(await done).toBe('');
});

it('never deletes the original recording', async () => {
  const { transcribe } = engine();
  const done = transcribe('file:///voice.m4a', 'audio');
  await Promise.resolve();
  emit('end');
  await done;
  expect(mockDelete).not.toHaveBeenCalled();
});
