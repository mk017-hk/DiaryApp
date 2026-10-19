import { linkParams, parseAuthLink, queryFromParams } from '../authLink';

/**
 * Links from emails.
 *
 * The one route by which somebody who has forgotten their password gets back
 * to their diary, so the parsing is tested against every shape Supabase can
 * send rather than the one this app asks for.
 */

describe('the link this app asks for', () => {
  it('reads a PKCE code from a custom scheme', () => {
    expect(parseAuthLink('diary://auth/callback?code=abc-123')).toEqual({
      kind: 'code',
      code: 'abc-123',
    });
  });

  // In Expo Go the scheme is exp:// and the path sits behind /--/.
  it('reads it from an Expo Go link too', () => {
    expect(parseAuthLink('exp://192.168.1.5:8081/--/auth/callback?code=abc')).toEqual({
      kind: 'code',
      code: 'abc',
    });
  });

  it('ignores parameters it does not need', () => {
    expect(parseAuthLink('diary://auth/callback?code=abc&utm_source=email')).toEqual({
      kind: 'code',
      code: 'abc',
    });
  });
});

describe('a token-hash link, from a custom email template', () => {
  it('reads a recovery link', () => {
    expect(parseAuthLink('diary://auth/callback?token_hash=h1&type=recovery')).toEqual({
      kind: 'otp',
      tokenHash: 'h1',
      type: 'recovery',
    });
  });

  it('reads a sign-up confirmation', () => {
    expect(parseAuthLink('diary://auth/callback?token_hash=h1&type=signup')).toEqual({
      kind: 'otp',
      tokenHash: 'h1',
      type: 'signup',
    });
  });

  // Passing the wrong type to verifyOtp fails anyway, and less clearly.
  it('refuses a type it does not recognise rather than guessing', () => {
    expect(parseAuthLink('diary://auth/callback?token_hash=h1&type=whatever')).toEqual({
      kind: 'failed',
      reason: 'unknown',
    });
  });
});

describe('an implicit-flow link, with the tokens in the fragment', () => {
  it('reads both tokens', () => {
    expect(
      parseAuthLink('diary://auth/callback#access_token=at&refresh_token=rt&type=signup'),
    ).toEqual({ kind: 'tokens', accessToken: 'at', refreshToken: 'rt', recovery: false });
  });

  it('knows a recovery link when it sees one', () => {
    expect(
      parseAuthLink('diary://auth/callback#access_token=at&refresh_token=rt&type=recovery'),
    ).toMatchObject({ kind: 'tokens', recovery: true });
  });

  it('does not accept half a pair', () => {
    expect(parseAuthLink('diary://auth/callback#access_token=at')).toEqual({ kind: 'empty' });
  });
});

describe('links that failed', () => {
  // What Supabase sends when a link is opened twice, or too late.
  it('recognises an expired link, from the query', () => {
    expect(
      parseAuthLink(
        'diary://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({ kind: 'failed', reason: 'expired' });
  });

  it('recognises one from the fragment as well', () => {
    expect(
      parseAuthLink('diary://auth/callback#error=access_denied&error_code=otp_expired'),
    ).toEqual({ kind: 'failed', reason: 'expired' });
  });

  it('treats any other error as a failure without pretending to know why', () => {
    expect(parseAuthLink('diary://auth/callback?error=server_error')).toEqual({
      kind: 'failed',
      reason: 'unknown',
    });
  });

  // A link carrying both is a server saying no. Trying the code anyway would
  // only produce a second, less helpful error.
  it('believes the error over a code', () => {
    expect(parseAuthLink('diary://auth/callback?code=abc&error=access_denied')).toMatchObject({
      kind: 'failed',
    });
  });
});

describe('nothing to do', () => {
  it('reports an empty link as empty', () => {
    expect(parseAuthLink('diary://auth/callback')).toEqual({ kind: 'empty' });
  });

  it('reports an empty code as empty rather than trying it', () => {
    expect(parseAuthLink('diary://auth/callback?code=')).toEqual({ kind: 'empty' });
  });
});

describe('the encoding details where hand-parsing goes wrong', () => {
  it('decodes percent-escapes', () => {
    expect(linkParams('diary://x?a=hello%20there').get('a')).toEqual('hello there');
  });

  it('turns a + into a space, as form encoding means', () => {
    expect(linkParams('diary://x?a=hello+there').get('a')).toEqual('hello there');
  });

  // The one screen between someone and their diary must not throw on a
  // mangled link.
  it('survives a malformed escape', () => {
    expect(() => linkParams('diary://x?a=%E0%A4%A')).not.toThrow();
  });

  it('keeps the first of a repeated parameter', () => {
    expect(linkParams('diary://x?code=first&code=second').get('code')).toEqual('first');
  });

  it('keeps a value containing an equals sign whole', () => {
    expect(linkParams('diary://x?token=a=b=c').get('token')).toEqual('a=b=c');
  });
});

describe('rebuilding a query from the router', () => {
  it('round-trips what the router hands over', () => {
    expect(parseAuthLink(queryFromParams({ code: 'abc' }))).toEqual({ kind: 'code', code: 'abc' });
  });

  it('survives values that need escaping', () => {
    const query = queryFromParams({ error_description: 'a & b = c' });

    expect(linkParams(query).get('error_description')).toEqual('a & b = c');
  });

  it('takes the first of an array value', () => {
    expect(queryFromParams({ code: ['one', 'two'] })).toEqual('?code=one');
  });

  it('produces nothing for nothing', () => {
    expect(queryFromParams({})).toEqual('');
  });
});
