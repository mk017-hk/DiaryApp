/**
 * Deletes the caller's account, and everything in it.
 *
 * Removing an `auth.users` row needs the service role key, which bypasses RLS
 * entirely and must never be inside the app. So this runs here, where the key
 * lives in function secrets, and it deletes exactly one user: the one whose
 * JWT arrived with the request. There is no id parameter, deliberately — a
 * function that took one would be an account-deletion weapon pointed at every
 * user, one forged request away.
 *
 * Order matters. Storage objects are not rows and nothing cascades to them, so
 * they are removed first, while the paths are still discoverable through
 * `entry_media`. Delete the user first and those paths are gone, leaving the
 * video of someone's worst week sitting in a bucket forever.
 *
 * No imports. The whole thing is `fetch` against the same REST, Storage and
 * Auth Admin endpoints the SDK would call, which means the function has no
 * module graph to resolve at boot — nothing to go wrong on a cold start
 * because a registry is slow or unreachable — and it starts faster for it.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

interface Config {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

function readConfig(): Config | null {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

/**
 * Who is calling, according to the token's signature.
 *
 * Asked of the auth server rather than decoded here: a JWT can be decoded by
 * anyone, and only verification tells you it was not written by the caller.
 */
async function callerId(config: Config, authorization: string): Promise<string | null> {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: config.anonKey },
  });

  if (!response.ok) return null;

  const user = (await response.json()) as { id?: string };
  return typeof user.id === 'string' && user.id.length > 0 ? user.id : null;
}

function serviceHeaders(config: Config): Record<string, string> {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

async function rest<T>(config: Config, path: string): Promise<T> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    headers: serviceHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`rest ${path.split('?')[0]} responded ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const config = readConfig();
  if (config === null) {
    console.error('delete-account is missing its environment');
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (authorization === null) return json({ error: 'unauthorized' }, 401);

  const userId = await callerId(config, authorization);
  if (userId === null) return json({ error: 'unauthorized' }, 401);

  try {
    // Diaries this user owns. A shared diary they merely belong to is not
    // theirs to empty — the other member's entries live there too.
    const diaries = await rest<{ id: string }[]>(
      config,
      `diaries?select=id&owner_id=eq.${encodeURIComponent(userId)}`,
    );

    if (diaries.length > 0) {
      const ids = diaries.map((row) => row.id).join(',');
      const media = await rest<{ storage_path: string | null }[]>(
        config,
        `entry_media?select=storage_path&diary_id=in.(${ids})`,
      );

      const paths = media
        .map((row) => row.storage_path)
        .filter((path): path is string => typeof path === 'string' && path.length > 0);

      // In batches: a heavy user's archive is longer than one request should
      // carry, and a rejected oversized body would leave everything behind.
      for (let index = 0; index < paths.length; index += 100) {
        const batch = paths.slice(index, index + 100);
        const response = await fetch(`${config.url}/storage/v1/object/entry-media`, {
          method: 'DELETE',
          headers: serviceHeaders(config),
          body: JSON.stringify({ prefixes: batch }),
        });

        // An object already gone is not a reason to abandon the deletion: the
        // goal is that nothing remains, and missing qualifies.
        if (!response.ok) {
          console.error(`could not remove a media batch: ${String(response.status)}`);
        }
      }
    }

    // Every table in public cascades from auth.users, so this is the deletion.
    const removed = await fetch(`${config.url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: serviceHeaders(config),
    });

    if (!removed.ok) throw new Error(`admin delete responded ${String(removed.status)}`);

    return json({ ok: true }, 200);
  } catch (error) {
    // Never echoed to the caller: it would name tables and columns.
    console.error('delete-account failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'delete_failed' }, 500);
  }
});
