/**
 * Reading a link from an email.
 *
 * Three shapes of link can arrive, depending on how the project is configured
 * and how old the email is, and the app has to accept all of them rather than
 * whichever one it was written against:
 *
 *   `?code=…`                 PKCE, what this app asks for. The code is useless
 *                             without a verifier stored on the phone that asked.
 *   `?token_hash=…&type=…`    A custom email template. Works on any device.
 *   `#access_token=…`         The implicit flow — tokens in the URL itself. Old
 *                             emails, or a link sent from the dashboard.
 *
 * Plus failures, which Supabase sends back on the same redirect as
 * `error` / `error_code`, in the query or the fragment.
 *
 * Pure, and deliberately so. Parsing URLs by hand is where the bugs are —
 * a `+` that should be a space, a fragment that should have been read — and it
 * is far easier to pin down here than through a deep link on a device.
 */

/** The email link types Supabase can send with a token hash. */
const OTP_TYPES = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'] as const;
export type EmailLinkType = (typeof OTP_TYPES)[number];

export type AuthLink =
  | { kind: 'code'; code: string }
  | { kind: 'otp'; tokenHash: string; type: EmailLinkType }
  | { kind: 'tokens'; accessToken: string; refreshToken: string; recovery: boolean }
  | { kind: 'failed'; reason: 'expired' | 'unknown' }
  /** Nothing to do — the route was opened without a link's parameters. */
  | { kind: 'empty' };

function decode(value: string): string {
  try {
    // Form encoding: a space can arrive as `+`. decodeURIComponent alone
    // would leave it, and an error description would read "Email+link+is…".
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    // A malformed escape sequence. Better a slightly wrong value than a
    // thrown error on the one screen standing between someone and their diary.
    return value;
  }
}

function readParams(part: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of part.split('&')) {
    if (pair.length === 0) continue;
    const at = pair.indexOf('=');
    const key = decode(at === -1 ? pair : pair.slice(0, at));
    const value = at === -1 ? '' : decode(pair.slice(at + 1));
    if (key.length > 0 && !params.has(key)) params.set(key, value);
  }
  return params;
}

/**
 * Every parameter in a URL, from the query and the fragment both.
 *
 * Hand-parsed rather than through `URL`: React Native's `URL` does not
 * implement `searchParams`, and a custom scheme like `diary://` is exactly the
 * sort of input partial implementations get wrong.
 */
export function linkParams(url: string): Map<string, string> {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt + 1);

  const queryAt = beforeHash.indexOf('?');
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);

  const params = readParams(query);
  for (const [key, value] of readParams(fragment)) {
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

export function parseAuthLink(url: string): AuthLink {
  const params = linkParams(url);

  // Failures first. A link carrying both an error and a code is a server
  // saying no, and trying the code anyway would only produce a second, less
  // helpful error.
  const error = params.get('error');
  const errorCode = params.get('error_code');
  if (error !== undefined || errorCode !== undefined) {
    return { kind: 'failed', reason: errorCode === 'otp_expired' ? 'expired' : 'unknown' };
  }

  const code = params.get('code');
  if (code !== undefined && code.length > 0) return { kind: 'code', code };

  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  if (tokenHash !== undefined && tokenHash.length > 0) {
    // An unknown type is refused rather than guessed at: passing the wrong
    // one to verifyOtp fails anyway, and less clearly.
    if ((OTP_TYPES as readonly string[]).includes(type ?? '')) {
      return { kind: 'otp', tokenHash, type: type as EmailLinkType };
    }
    return { kind: 'failed', reason: 'unknown' };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken !== undefined && refreshToken !== undefined) {
    return { kind: 'tokens', accessToken, refreshToken, recovery: type === 'recovery' };
  }

  return { kind: 'empty' };
}

/**
 * Turns the router's search params back into something `parseAuthLink` reads.
 *
 * Expo Router hands the query to a screen as an object and drops the fragment.
 * For PKCE and token-hash links the query is all there is, so this is enough;
 * the fragment, for implicit-flow links, comes from the full URL instead.
 */
export function queryFromParams(params: Record<string, string | string[] | undefined>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(first)}`);
  }
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
