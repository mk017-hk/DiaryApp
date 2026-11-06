import {
  buildEntryPrompt,
  interpret,
  OUTPUT_SCHEMA,
  readableText,
  SYSTEM_PROMPT,
  type Reflection,
  type ReflectionSource,
} from './prompt.ts';

/**
 * Reflect: notes and suggestions on one entry.
 *
 * POST { entry_id, force? }. The design follows `../assistant`, and the three
 * things that matter most are the same:
 *
 * **It reads as the caller.** `reflection_source` runs with her own token, so
 * RLS applies, and it returns nothing at all unless she wrote the entry, has
 * consented, and has not held it back. The service role is used only to write
 * the result and to count today's requests — never to read an entry.
 *
 * **The exclusion rules are in SQL**, where a forgotten condition in this file
 * cannot undo them.
 *
 * **Only text is sent**: what she wrote and what was transcribed. No media, no
 * ids, no email.
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

/**
 * The Anthropic SDK, loaded the first time a model call is actually made.
 *
 * Most requests never get that far — not her entry, held back, nothing to
 * read, no key configured, today's limit reached — and none of them should
 * pay to load an SDK on a cold start. The specifiers are literals, so the
 * bundler still sees them when the function is deployed.
 */
let sdk: Promise<
  [
    typeof import('npm:@anthropic-ai/sdk@1.3.0'),
    typeof import('npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema'),
  ]
> | null = null;

const loadSdk = () =>
  (sdk ??= Promise.all([
    import('npm:@anthropic-ai/sdk@1.3.0'),
    import('npm:@anthropic-ai/sdk@1.3.0/helpers/beta/json-schema'),
  ]));

/** A ceiling on what one account can spend in a day. Generous for a diary. */
const DAILY_LIMIT = 40;

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
    modelKey: Deno.env.get('ANTHROPIC_API_KEY') ?? undefined,
    model: Deno.env.get('REFLECT_MODEL') ?? 'claude-opus-5-5',
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

/** As the caller. Empty means "not hers, not allowed, or not there". */
async function loadSource(
  config: Config,
  authorization: string,
  entryId: string,
): Promise<ReflectionSource | null> {
  const response = await fetch(`${config.url}/rest/v1/rpc/reflection_source`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target: entryId }),
  });
  if (!response.ok) throw new Error(`reflection_source responded ${String(response.status)}`);
  const rows = (await response.json()) as ReflectionSource[];
  return rows[0] ?? null;
}

async function displayName(config: Config, authorization: string): Promise<string> {
  const response = await fetch(`${config.url}/rest/v1/profiles?select=display_name`, {
    headers: { Authorization: authorization, apikey: config.anonKey },
  });
  if (!response.ok) return '';
  const rows = (await response.json()) as { display_name: string | null }[];
  return rows[0]?.display_name ?? '';
}

const service = (config: Config) => ({
  apikey: config.serviceRoleKey,
  Authorization: `Bearer ${config.serviceRoleKey}`,
  'Content-Type': 'application/json',
});

interface StoredReflection extends Reflection {
  id: string;
  entry_id: string;
  created_at: string;
}

async function existingReflection(config: Config, entryId: string, userId: string) {
  const response = await fetch(
    `${config.url}/rest/v1/entry_reflections?select=id,entry_id,notes,themes,feelings,suggestions,created_at&entry_id=eq.${entryId}&user_id=eq.${userId}`,
    { headers: service(config) },
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as StoredReflection[];
  return rows[0] ?? null;
}

async function reflectionsToday(config: Config, userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch(
    `${config.url}/rest/v1/entry_reflections?select=id&user_id=eq.${userId}&created_at=gte.${since}`,
    { headers: { ...service(config), Prefer: 'count=exact', Range: '0-0' } },
  );
  const range = response.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : 0;
}

async function saveReflection(
  config: Config,
  row: { entry_id: string; diary_id: string; user_id: string; model: string } & Reflection,
): Promise<StoredReflection> {
  const response = await fetch(`${config.url}/rest/v1/entry_reflections?on_conflict=entry_id`, {
    method: 'POST',
    headers: { ...service(config), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      entry_id: row.entry_id,
      diary_id: row.diary_id,
      user_id: row.user_id,
      notes: row.notes,
      themes: row.themes,
      feelings: row.feelings,
      suggestions: row.suggestions,
      model: row.model,
      created_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) throw new Error(`saving reflection responded ${String(response.status)}`);
  const rows = (await response.json()) as StoredReflection[];
  const saved = rows[0];
  if (saved === undefined) throw new Error('saving reflection returned nothing');
  return saved;
}

/**
 * The one call that leaves our infrastructure. Text only.
 *
 * Structured outputs guarantee the shape; `interpret` then enforces what the
 * shape cannot — length, and the copy rules. Server-side fallback is on, so a
 * request a safety classifier declines is retried on the model Anthropic
 * recommends for that case rather than simply failing.
 */
type ModelAnswer =
  | { kind: 'answer'; parsed: unknown; model: string }
  | { kind: 'unavailable'; reason: 'declined' | 'busy' | 'no_model_configured' | 'model_error' };

async function askModel(config: Config, prompt: string): Promise<ModelAnswer> {
  const [{ default: Anthropic }, { betaJSONSchemaOutputFormat }] = await loadSdk();
  const client = new Anthropic({ apiKey: config.modelKey, maxRetries: 2, timeout: 120_000 });

  try {
    const message = await client.beta.messages.parse({
      model: config.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // The default model always thinks; effort is the control, and medium
      // is plenty for a few lines about one entry. Set explicitly rather than
      // left to the model's default.
      output_config: {
        effort: 'medium',
        format: betaJSONSchemaOutputFormat(OUTPUT_SCHEMA),
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    // A decline the fallback could not rescue, or an answer cut off before it
    // finished: either way there is nothing whole to show.
    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
      return { kind: 'unavailable', reason: 'declined' };
    }
    return { kind: 'answer', parsed: message.parsed_output ?? null, model: message.model };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { kind: 'unavailable', reason: 'busy' };
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('reflect: the model key was refused');
      return { kind: 'unavailable', reason: 'no_model_configured' };
    }
    if (error instanceof Anthropic.APIError) {
      console.error('reflect: model error', error.status);
      return { kind: 'unavailable', reason: 'model_error' };
    }
    throw error;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const config = readConfig();
  if (config === null) {
    console.error('reflect is missing its environment');
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (authorization === null) return json({ error: 'unauthorized' }, 401);

  const userId = await callerId(config, authorization);
  if (userId === null) return json({ error: 'unauthorized' }, 401);

  let entryId: string;
  let force = false;
  try {
    const body = (await request.json()) as { entry_id?: unknown; force?: unknown };
    if (typeof body.entry_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.entry_id)) {
      return json({ error: 'bad_request' }, 400);
    }
    entryId = body.entry_id;
    force = body.force === true;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  try {
    const source = await loadSource(config, authorization, entryId);
    if (source === null) return json({ outcome: 'unavailable', reason: 'not_allowed' }, 200);

    const text = readableText(source);
    if (text.length === 0) return json({ outcome: 'unavailable', reason: 'nothing_to_read' }, 200);

    // Already reflected on since it last changed: hand that back rather than
    // paying for the same notes twice.
    const existing = await existingReflection(config, entryId, userId);
    if (
      existing !== null &&
      !force &&
      Date.parse(existing.created_at) >= Date.parse(source.updated_at)
    ) {
      return json({ outcome: 'reflection', reflection: existing }, 200);
    }

    if (config.modelKey === undefined) {
      return json({ outcome: 'unavailable', reason: 'no_model_configured' }, 200);
    }

    if ((await reflectionsToday(config, userId)) >= DAILY_LIMIT) {
      return json({ outcome: 'unavailable', reason: 'daily_limit' }, 200);
    }

    const name = await displayName(config, authorization);
    const answer = await askModel(config, buildEntryPrompt(source, name));
    if (answer.kind === 'unavailable') {
      return json({ outcome: 'unavailable', reason: answer.reason }, 200);
    }

    const outcome = interpret(answer.parsed, text);
    if (outcome.kind === 'support') return json({ outcome: 'support' }, 200);
    if (outcome.kind === 'withheld') {
      return json({ outcome: 'unavailable', reason: 'withheld' }, 200);
    }

    const saved = await saveReflection(config, {
      entry_id: source.entry_id,
      diary_id: source.diary_id,
      user_id: userId,
      model: answer.model,
      ...outcome.reflection,
    });

    return json({ outcome: 'reflection', reflection: saved }, 200);
  } catch (error) {
    console.error('reflect failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'reflect_failed' }, 500);
  }
});
