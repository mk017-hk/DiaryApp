/**
 * Where a photo or a voice note ends up on disk.
 *
 * Two things here are load-bearing rather than cosmetic. The file is named by
 * the media id, which is also the name of the object in the bucket, so a retried
 * upload overwrites rather than leaving a second copy behind. And it lands in
 * the document directory, because the cache directory is a place iOS empties
 * whenever storage runs low — a photo attached to an entry in March must still
 * be there in June.
 */

import {
  deleteAllCaptured,
  deleteCaptured,
  persistPhoto,
  persistVoiceNote,
} from '../captureStorage';

interface MovedFile {
  from: string;
  to: string;
}

const mockMoved: MovedFile[] = [];
const mockCopied: MovedFile[] = [];
const mockCreated: string[] = [];
const mockDeleted: string[] = [];

let mockMoveFails = false;
let mockExisting = new Set<string>();

jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;

    constructor(base: string | { uri: string }, name?: string) {
      const root = typeof base === 'string' ? base : base.uri;
      this.uri = name === undefined ? root : `${root}${name}/`;
    }

    get exists() {
      return mockExisting.has(this.uri);
    }

    create() {
      mockCreated.push(this.uri);
      mockExisting.add(this.uri);
    }

    delete() {
      mockDeleted.push(this.uri);
      mockExisting.delete(this.uri);
    }
  }

  class File {
    uri: string;

    constructor(base: string | { uri: string }, name?: string) {
      const root = typeof base === 'string' ? base : base.uri;
      this.uri = name === undefined ? root : `${root}${name}`;
    }

    get exists() {
      return mockExisting.has(this.uri);
    }

    move(destination: { uri: string }) {
      if (mockMoveFails) throw new Error('cross-volume move');
      mockMoved.push({ from: this.uri, to: destination.uri });
    }

    copy(destination: { uri: string }) {
      mockCopied.push({ from: this.uri, to: destination.uri });
    }

    delete() {
      mockDeleted.push(this.uri);
      mockExisting.delete(this.uri);
    }
  }

  return { Directory, File, Paths: { document: 'file:///documents/' } };
});

beforeEach(() => {
  mockMoved.length = 0;
  mockCopied.length = 0;
  mockCreated.length = 0;
  mockDeleted.length = 0;
  mockMoveFails = false;
  mockExisting = new Set();
});

describe('keeping a photo', () => {
  it('names it after the media id, so a retry overwrites instead of duplicating', () => {
    const uri = persistPhoto('file:///cache/ImagePicker/AB12.jpg', 'media-1');

    expect(uri).toEqual('file:///documents/photos/media-1.jpg');
    expect(mockMoved).toEqual([
      { from: 'file:///cache/ImagePicker/AB12.jpg', to: 'file:///documents/photos/media-1.jpg' },
    ]);
  });

  // The cache directory is the one place a file is not safe. Landing anywhere
  // under it would mean entries losing their photos months later.
  it('puts it in the document directory, never the cache', () => {
    expect(persistPhoto('file:///cache/x.jpg', 'media-1')).not.toContain('cache');
  });

  it('creates the directory the first time and not again', () => {
    persistPhoto('file:///cache/a.jpg', 'media-1');
    persistPhoto('file:///cache/b.jpg', 'media-2');

    expect(mockCreated).toEqual(['file:///documents/photos/']);
  });

  it('keeps the format it was given', () => {
    expect(persistPhoto('file:///cache/x.HEIC', 'm')).toEqual('file:///documents/photos/m.heic');
    expect(persistPhoto('file:///cache/x.png', 'm')).toEqual('file:///documents/photos/m.png');
  });

  it('assumes a photo when the picker hands back no extension', () => {
    expect(persistPhoto('file:///cache/IMG_0001', 'm')).toEqual('file:///documents/photos/m.jpg');
  });

  // Reading the extension from the whole path would take `folder/IMG_0001` as
  // the extension here, and name the stored file after it.
  it('reads the extension from the file name, not the path', () => {
    expect(persistPhoto('file:///my.folder/IMG_0001', 'm')).toEqual(
      'file:///documents/photos/m.jpg',
    );
  });

  it('ignores a query string the uri arrived with', () => {
    expect(persistPhoto('file:///cache/x.jpg?width=100', 'm')).toEqual(
      'file:///documents/photos/m.jpg',
    );
  });

  // A move between volumes can fail where a copy succeeds, and losing the
  // photo at that point would lose it for good — it is about to be mockDeleted
  // from the cache either way.
  it('copies when the move is refused', () => {
    mockMoveFails = true;

    const uri = persistPhoto('file:///cache/x.jpg', 'media-1');

    expect(uri).toEqual('file:///documents/photos/media-1.jpg');
    expect(mockCopied).toHaveLength(1);
  });
});

describe('keeping a voice note', () => {
  it('goes somewhere of its own, named the same way', () => {
    expect(persistVoiceNote('file:///cache/recording-9.m4a', 'media-2')).toEqual(
      'file:///documents/audio/media-2.m4a',
    );
  });

  it('assumes m4a when the recorder hands back no extension', () => {
    expect(persistVoiceNote('file:///cache/recording', 'm')).toEqual(
      'file:///documents/audio/m.m4a',
    );
  });
});

describe('clearing up', () => {
  it('deletes a file that is there', () => {
    mockExisting.add('file:///documents/photos/m.jpg');

    deleteCaptured('file:///documents/photos/m.jpg');

    expect(mockDeleted).toEqual(['file:///documents/photos/m.jpg']);
  });

  // It may already be gone — a sync tidying up after a delete that half
  // happened. Throwing there would abort the rest of the clear-up.
  it('says nothing about a file that has already gone', () => {
    expect(() => deleteCaptured('file:///documents/photos/missing.jpg')).not.toThrow();
    expect(mockDeleted).toEqual([]);
  });

  // Signing out has to take both with it. A photo left behind would outlive
  // the diary it belonged to and be there for whoever signs in next.
  it('clears photos and voice notes together on sign-out', () => {
    mockExisting.add('file:///documents/photos/');
    mockExisting.add('file:///documents/audio/');

    deleteAllCaptured();

    expect(mockDeleted).toEqual(['file:///documents/photos/', 'file:///documents/audio/']);
  });

  it('still clears the second directory when the first is not there', () => {
    mockExisting.add('file:///documents/audio/');

    deleteAllCaptured();

    expect(mockDeleted).toEqual(['file:///documents/audio/']);
  });
});
