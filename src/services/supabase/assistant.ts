import { isSupabaseConfigured, supabase } from './client';
import { toAppError } from './errors';

/**
 * The assistant, from the app's side.
 *
 * Almost nothing happens here. Context assembly, the exclusion rules and the
 * model call all live server-side, where a client cannot argue with them —
 * this is the small surface that asks, reads the answer, and records consent.
 */

export interface AssistantMessage {
  id: string;
  kind: 'question' | 'observation';
  content: string;
  /**
   * The entries this was drawn from.
   *
   * The honesty feature of this app: a person can always see exactly what a
   * question was based on, and open any of it.
   */
  basedOn: string[];
  createdAt: string;
}

export interface Consent {
  /**
   * Whether the assistant is genuinely on.
   *
   * Both halves, deliberately. `ai_enabled` defaults to true, so reporting it
   * alone described a state the database did not agree with: the settings
   * screen said "On" while `assistant_allowed()` returned false because
   * consent had never actually been recorded. A toggle that lies about
   * whether something reads your diary is worse than no toggle.
   */
  enabled: boolean;
  /** When they were first asked. Null means never — which is not the same as no. */
  consentedAt: string | null;
}

export async function readConsent(): Promise<Consent | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('ai_enabled, ai_consented_at')
      .limit(1)
      .maybeSingle();

    if (error !== null || data === null) return null;

    const consentedAt = (data.ai_consented_at as string | null) ?? null;

    return {
      enabled: (data.ai_enabled as boolean) && consentedAt !== null,
      consentedAt,
    };
  } catch (error) {
    toAppError(error, 'read consent');
    return null;
  }
}

/**
 * Records a decision.
 *
 * Withdrawing keeps the date consent was first given — clearing it would make
 * a second ask look like a first one, and being asked the same question twice
 * as though nothing had happened is its own small disrespect.
 */
export async function setConsent(enabled: boolean): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  try {
    const { error } = await supabase.rpc('set_assistant_consent', { enabled });
    if (error !== null) {
      toAppError(error, 'save consent');
      return false;
    }
    return true;
  } catch (error) {
    toAppError(error, 'save consent');
    return false;
  }
}

export type AskOutcome =
  | { kind: 'question'; content: string; basedOn: string[] }
  /** Nothing worth asking today. A perfectly good outcome. */
  | { kind: 'silence' }
  /** The writing described a crisis. The app shows real resources. */
  | { kind: 'support' }
  | { kind: 'unavailable' };

/**
 * Asks for today's question.
 *
 * Every failure is `unavailable` rather than an error a screen has to render.
 * The assistant is the best part of this app and it is still not important
 * enough to interrupt somebody's morning with a problem report.
 */
export async function askAssistant(): Promise<AskOutcome> {
  if (!isSupabaseConfigured) return { kind: 'unavailable' };

  try {
    const { data, error } = await supabase.functions.invoke('assistant', { method: 'POST' });
    if (error !== null) {
      toAppError(error, 'ask assistant');
      return { kind: 'unavailable' };
    }

    const body = data as { outcome?: string; content?: string; based_on?: string[] };

    if (body.outcome === 'question' && typeof body.content === 'string') {
      return { kind: 'question', content: body.content, basedOn: body.based_on ?? [] };
    }

    if (body.outcome === 'support') return { kind: 'support' };
    return { kind: 'silence' };
  } catch (error) {
    toAppError(error, 'ask assistant');
    return { kind: 'unavailable' };
  }
}

/** The most recent question, if there is one that has not been dismissed. */
export async function latestMessage(): Promise<AssistantMessage | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('id, kind, content, based_on_entry_ids, created_at')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error !== null || data === null || data.length === 0) return null;

    const row = data[0];
    if (row === undefined) return null;

    return {
      id: row.id as string,
      kind: row.kind as 'question' | 'observation',
      content: row.content as string,
      basedOn: (row.based_on_entry_ids as string[] | null) ?? [],
      createdAt: row.created_at as string,
    };
  } catch (error) {
    toAppError(error, 'read assistant message');
    return null;
  }
}

/**
 * Puts a question away.
 *
 * One question a day, dismissible, never repeated. Dismissing is the whole
 * mechanism for the second half of that.
 */
export async function dismissMessage(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  try {
    await supabase
      .from('ai_messages')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id);
  } catch (error) {
    toAppError(error, 'dismiss assistant message');
  }
}
