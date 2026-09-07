import {
  buildUserPrompt,
  citedEntryIds,
  interpret,
  SYSTEM_PROMPT,
  type ContextRow,
} from './prompt.ts';

/**
 * The assistant.
 *
 * Assembles what the model may see, asks it for one question, and records both
 * the question and what it was drawn from.
 *
 * Three things about the design matter more than the rest.
 *
 * **It reads as the caller, not as the service role.** The context query runs
 * with the user's own token, so Row Level Security applies and this function
 * literally cannot read more of somebody's diary than they can. The service
 * role appears exactly once, to write the resulting message — and never to
 * read diary content.
 *
 * **The exclusion rules are in SQL.** Private threads, `ai_excluded` entries
 * and un-consented accounts are filtered by `assistant_context`, not here. A
 * version that filtered in TypeScript would be one forgotten condition away
 * from putting somebody's worst week into a prompt.
 *
 * **Only text is ever sent.** No media, no storage paths, no ids, no email.
 * What goes up is what was written, and when.
 *
 * No imports beyond the local prompt module: nothing to resolve on a cold
 * start, and one less thing to go wrong.
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
  modelKey: string | undefined;
  model: string;
}

function readConfig(): Config | null {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceRoleKey) return null;

  return {
    url,
    anonKey,
    serviceRoleKey,
    // Absent in local development, and that is a supported state rather than a
    // failure: everything except the model call can be exercised without it.
    modelKey: Deno.env.get('ANTHROPIC_API_KEY') ?? undefined,
    model: Deno.env.get('ASSISTANT_MODEL') ?? 'claude-sonnet-5',
  };
}

async function callerId(config: Config, authorization: string): Promise<string | null> {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: config.anonKey },
  });

  if (!response.ok) return null;

  const user = (await response.json()) as { id?: string };
  return typeof user.id === 'string' && user.id.length > 0 ? user.id : null;
}

/**
 * The entries the assistant may read.
 *
 * Called with the caller's own Authorization header, deliberately. The
 * function is SECURITY INVOKER, so this is the point at which RLS confines the
 * whole operation to one person's own diaries.
 */
async function loadContext(config: Config, authorization: string): Promise<ContextRow[]> {
  const response = await fetch(`${config.url}/rest/v1/rpc/assistant_context`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ window_days: 14, max_entries: 60 }),
  });

  if (!response.ok) throw new Error(`context rpc responded ${String(response.status)}`);

  return (await response.json()) as ContextRow[];
}

async function displayName(config: Config, authorization: string): Promise<string> {
  const response = await fetch(`${config.url}/rest/v1/profiles?select=display_name`, {
    headers: { Authorization: authorization, apikey: config.anonKey },
  });

  if (!response.ok) return '';

  const rows = (await response.json()) as { display_name: string | null }[];
  return rows[0]?.display_name ?? '';
}

/** The one call that leaves our infrastructure. Text only. */
async function askModel(config: Config, prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.modelKey ?? '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`model responded ${String(response.status)}`);

  const body = (await response.json()) as { content?: { type: string; text?: string }[] };
  return (body.content ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

/**
 * Records the question, and what it was drawn from.
 *
 * The service role's only job here. Writing is the one thing the caller cannot
 * do themselves — the policy on `ai_messages` lets a person read and dismiss
 * their messages but never author one, so a client cannot forge a question and
 * attribute it to the assistant.
 */
async function saveMessage(
  config: Config,
  row: { diary_id: string; user_id: string; kind: string; content: string; based_on: string[] },
): Promise<void> {
  const response = await fetch(`${config.url}/rest/v1/ai_messages`, {
    method: 'POST',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      diary_id: row.diary_id,
      user_id: row.user_id,
      kind: row.kind,
      content: row.content,
      based_on_entry_ids: row.based_on,
    }),
  });

  if (!response.ok) throw new Error(`saving message responded ${String(response.status)}`);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const config = readConfig();
  if (config === null) {
    console.error('assistant is missing its environment');
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (authorization === null) return json({ error: 'unauthorized' }, 401);

  const userId = await callerId(config, authorization);
  if (userId === null) return json({ error: 'unauthorized' }, 401);

  try {
    const rows = await loadContext(config, authorization);

    // No consent, or nothing worth reading. Both are ordinary, and neither is
    // an error — a diary with nothing in it should not produce a failure.
    if (rows.length === 0) return json({ outcome: 'silence', reason: 'no_context' }, 200);

    const diaryId = rows[0]?.diary_id;
    if (typeof diaryId !== 'string') {
      return json({ outcome: 'silence', reason: 'no_context' }, 200);
    }

    const cited = citedEntryIds(rows);
    if (cited.length === 0) return json({ outcome: 'silence', reason: 'no_text' }, 200);

    // Nothing to call. Everything up to here has run, which is what makes the
    // function testable end to end without a provider key.
    if (config.modelKey === undefined) {
      return json({ outcome: 'silence', reason: 'no_model_configured', cited: cited.length }, 200);
    }

    const name = await displayName(config, authorization);
    const raw = await askModel(config, buildUserPrompt(rows, name));
    const outcome = interpret(raw);

    if (outcome.kind === 'silence') return json({ outcome: 'silence', reason: 'withheld' }, 200);

    if (outcome.kind === 'support') {
      // Deliberately not stored as a question and deliberately not answered
      // here. The app shows real resources; a model attempting to counsel
      // somebody in crisis would be worse than saying nothing.
      return json({ outcome: 'support' }, 200);
    }

    await saveMessage(config, {
      diary_id: diaryId,
      user_id: userId,
      kind: 'question',
      content: outcome.content,
      based_on: cited,
    });

    return json({ outcome: 'question', content: outcome.content, based_on: cited }, 200);
  } catch (error) {
    // Never echoed: it would name tables, and on a model failure it could
    // carry back part of a prompt.
    console.error('assistant failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'assistant_failed' }, 500);
  }
});
