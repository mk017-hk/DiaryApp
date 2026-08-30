import { __testing } from '../index';

const { redact } = __testing;

/**
 * The logger is a security control, not a convenience.
 *
 * Device logs are readable by other tooling and by anyone with physical access,
 * so a regression that lets entry text or a token through is a data leak. These
 * tests pin the redaction behaviour.
 */
describe('logger redaction', () => {
  it('never emits raw string values', () => {
    expect(redact({ note: 'I felt calm today' })).toEqual({ note: '[redacted]' });
    expect(redact({ unknownField: 'some value' })).toEqual({ unknownField: '[string:10]' });
  });

  it('redacts sensitive keys regardless of case or nesting', () => {
    const result = redact({
      user: { email: 'a@b.com', accessToken: 'xyz' },
      entry: { body: 'private thoughts', id: 42 },
    });

    expect(result).toEqual({
      user: { email: '[redacted]', accessToken: '[redacted]' },
      entry: { body: '[redacted]', id: 42 },
    });
  });

  it('redacts storage paths and signed URLs', () => {
    expect(redact({ storagePath: 'user-id/entry-id/photo.jpg' })).toEqual({
      storagePath: '[redacted]',
    });
    expect(redact({ signedUrl: 'https://example.com/token' })).toEqual({
      signedUrl: '[redacted]',
    });
  });

  it('summarises arrays instead of serialising their contents', () => {
    // Only the length survives, so filenames and entry text inside an array
    // cannot leak even when the key itself looks harmless.
    expect(redact({ photos: ['a.jpg', 'b.jpg'] })).toEqual({ photos: '[array:2]' });
    expect(redact({ items: [1, 2, 3] })).toEqual({ items: '[array:3]' });
  });

  it('keeps error names and messages, which are developer-authored', () => {
    expect(redact(new Error('Network request failed'))).toEqual({
      name: 'Error',
      message: 'Network request failed',
    });
  });

  it('preserves non-sensitive scalars useful for debugging', () => {
    expect(redact({ count: 3, retried: true, id: null })).toEqual({
      count: 3,
      retried: true,
      id: null,
    });
  });

  it('stops descending at the depth limit', () => {
    expect(redact({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: '[depth-limit]' } },
    });
  });
});
