import { execFileSync } from 'node:child_process';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

/**
 * Test harness for the isolation suite.
 *
 * Keys are read from the running local stack rather than committed, so nothing
 * key-shaped ever enters the repository — the same rule the app follows.
 */

interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

let cached: LocalStack | undefined;

export function localStack(): LocalStack {
  if (cached !== undefined) return cached;

  const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  const status = JSON.parse(raw) as Record<string, string>;
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase is not running. Start it with: npx supabase start');
  }

  cached = { apiUrl, anonKey, serviceRoleKey };
  return cached;
}

/** Bypasses RLS. Used only to create fixtures, never to assert access. */
export function adminClient(): SupabaseClient {
  const { apiUrl, serviceRoleKey } = localStack();
  return createClient(apiUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  user: User;
  client: SupabaseClient;
  diaryId: string;
}

/**
 * Creates a confirmed user, signs them in, and returns a client carrying their
 * JWT — so every query runs under exactly the policies a real device would hit.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const { apiUrl, anonKey } = localStack();
  const admin = adminClient();

  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = 'test-password-9f3b2a';

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: label },
  });
  if (createError !== null) throw createError;
  const user = created.user;
  if (user === null) throw new Error('createUser returned no user');

  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError !== null) throw signInError;

  // The handle_new_user trigger should have created a personal diary.
  const { data: diaries, error: diaryError } = await client.from('diaries').select('id');
  if (diaryError !== null) throw diaryError;
  if (diaries === null || diaries.length !== 1) {
    throw new Error(`expected exactly one personal diary, got ${String(diaries?.length)}`);
  }

  return { user, client, diaryId: diaries[0]!.id as string };
}

export async function deleteTestUser(testUser: TestUser): Promise<void> {
  await adminClient().auth.admin.deleteUser(testUser.user.id);
}

/** Creates an entry as the given user, returning its id. */
export async function createEntry(
  owner: TestUser,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await owner.client
    .from('journal_entries')
    .insert({
      diary_id: owner.diaryId,
      author_id: owner.user.id,
      body: 'A private thing I wrote down.',
      mood: 3,
      ...fields,
    })
    .select('id')
    .single();

  if (error !== null) throw error;
  return data.id as string;
}

export async function createThread(owner: TestUser, isPrivate = false): Promise<string> {
  const { data, error } = await owner.client
    .from('threads')
    .insert({ diary_id: owner.diaryId, title: 'Trying again', is_private: isPrivate })
    .select('id')
    .single();

  if (error !== null) throw error;
  return data.id as string;
}
