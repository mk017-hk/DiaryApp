import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { parseAuthLink } from '../../src/features/auth/authLink';

import { createTestUser, deleteTestUser, localStack, type TestUser } from './helpers';

/**
 * Forgetting a password, end to end.
 *
 * Until this existed, a reset email's link opened a web page with nowhere to
 * type anything, and somebody who forgot their password had lost their diary.
 * Each step below is the real thing — the real auth server, the real email it
 * sends, the real redirect — and the link is read by the app's own parser.
 *
 * What is not covered here is the iOS half: the OS handing `diary://` to the
 * app. That needs a device. Everything either side of it is proven.
 *
 * Requires the local stack: npx supabase start
 * and config.toml's additional_redirect_urls to include diary://**
 */

jest.setTimeout(60_000);

const MAILPIT = 'http://127.0.0.1:54324';
const APP_LINK = 'diary://auth/callback';
const OLD_PASSWORD = 'test-password-9f3b2a';

/** A device: a PKCE client whose storage persists between calls, as the keychain does. */
const device = (): SupabaseClient => {
  const { apiUrl, anonKey } = localStack();
  const store = new Map<string, string>();

  return createClient(apiUrl, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
    },
  });
};

/** The newest email to an address, waiting for it to arrive. */
const latestEmailTo = async (address: string): Promise<string> => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    const newest = messages[0];

    if (newest !== undefined) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`);
      const { Text, HTML } = (await message.json()) as { Text: string; HTML: string };
      return `${Text}\n${HTML}`;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email arrived for ${address}`);
};

const clearInbox = async () => {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' });
};

/** The verify link in an email body. */
const verifyLinkIn = (body: string): string => {
  const match = /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify\?[^\s"'<>]*/.exec(body);
  if (match === null) throw new Error('No verify link in the email');
  return match[0].replace(/&amp;/g, '&');
};

/**
 * Follows the link exactly as far as the auth server goes, and stops at the
 * redirect — which is where iOS would take over and open the app.
 */
const whereTheLinkSends = async (link: string): Promise<string> => {
  const response = await fetch(link, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (location === null) throw new Error(`Expected a redirect, got ${String(response.status)}`);
  return location;
};

/** Asks for a reset from a device, and returns where the emailed link leads. */
const requestReset = async (
  phone: SupabaseClient,
  email: string,
  redirectTo = APP_LINK,
): Promise<string> => {
  await clearInbox();
  const { error } = await phone.auth.resetPasswordForEmail(email, { redirectTo });
  if (error !== null) throw error;
  return whereTheLinkSends(verifyLinkIn(await latestEmailTo(email)));
};

const signsInWith = async (email: string, password: string): Promise<boolean> => {
  const { error } = await device().auth.signInWithPassword({ email, password });
  return error === null;
};

let user: TestUser;
let email: string;

beforeEach(async () => {
  user = await createTestUser('forgetful');
  email = user.user.email as string;
});

afterEach(async () => {
  await deleteTestUser(user);
});

describe('the whole way through', () => {
  it('gets somebody from a forgotten password back into their diary', async () => {
    const phone = device();

    // 1. The email's link comes back into the app, not to a web page.
    const landing = await requestReset(phone, email);
    expect(landing.startsWith(`${APP_LINK}?`)).toBe(true);

    // 2. The app's own parser reads it.
    const link = parseAuthLink(landing);
    expect(link.kind).toEqual('code');
    if (link.kind !== 'code') return;

    // 3. The phone that asked can complete it — and knows, from what it
    //    stored when asking, that this is a reset. This is the runtime field
    //    auth-js's types leave out and the app relies on.
    const { data, error } = await phone.auth.exchangeCodeForSession(link.code);
    expect(error).toBeNull();
    expect((data as typeof data & { redirectType?: string }).redirectType).toEqual('recovery');

    // 4. A new password can be set.
    const { error: updateError } = await phone.auth.updateUser({ password: 'a brand new phrase' });
    expect(updateError).toBeNull();

    // 5. And it is the one that works now.
    expect(await signsInWith(email, 'a brand new phrase')).toBe(true);
    expect(await signsInWith(email, OLD_PASSWORD)).toBe(false);
  });
});

/**
 * What the screens claim, checked against the server.
 */
describe('what the app tells people', () => {
  // "Open it on the phone you asked for it from." PKCE's one real limitation,
  // and the reason that sentence exists.
  it('cannot be completed on a phone that did not ask for it', async () => {
    const landing = await requestReset(device(), email);
    const link = parseAuthLink(landing);
    if (link.kind !== 'code') throw new Error('expected a code');

    const { error } = await device().auth.exchangeCodeForSession(link.code);

    expect(error).not.toBeNull();
  });

  // "Each one works once."
  it('works once', async () => {
    const phone = device();
    const link = parseAuthLink(await requestReset(phone, email));
    if (link.kind !== 'code') throw new Error('expected a code');

    const first = await phone.auth.exchangeCodeForSession(link.code);
    const second = await phone.auth.exchangeCodeForSession(link.code);

    expect(first.error).toBeNull();
    expect(second.error).not.toBeNull();
  });

  // "Any other phone signed in to your diary has been signed out." The reset
  // screen says this; here is the server agreeing.
  it('signs out every other session once the password is changed', async () => {
    const otherPhone = device();
    await otherPhone.auth.signInWithPassword({ email, password: OLD_PASSWORD });

    const phone = device();
    const link = parseAuthLink(await requestReset(phone, email));
    if (link.kind !== 'code') throw new Error('expected a code');
    await phone.auth.exchangeCodeForSession(link.code);
    await phone.auth.updateUser({ password: 'a brand new phrase' });
    await phone.auth.signOut({ scope: 'others' });

    const { error } = await otherPhone.auth.refreshSession();
    expect(error).not.toBeNull();

    // And the phone that did the reset is still signed in.
    const { error: stillIn } = await phone.auth.refreshSession();
    expect(stillIn).toBeNull();
  });
});

/**
 * The allow list.
 *
 * The setting most likely to be missed on going live, and the one with the
 * least obvious symptom: a redirect not on the list is replaced with the site
 * URL without any error, and the email opens a web page instead of the app.
 */
describe('where a link is allowed to go', () => {
  it('honours the app’s own scheme, because it is on the list', async () => {
    expect((await requestReset(device(), email)).startsWith(APP_LINK)).toBe(true);
  });

  // Also why the list matters for security: a reset link that could be pointed
  // anywhere would hand somebody's sign-in code to whoever chose the address.
  it('refuses to send a link anywhere that is not on it', async () => {
    const landing = await requestReset(device(), email, 'https://somewhere-else.example/steal');

    expect(landing).not.toContain('somewhere-else.example');
    expect(landing.startsWith('http://127.0.0.1:3000')).toBe(true);
  });
});
