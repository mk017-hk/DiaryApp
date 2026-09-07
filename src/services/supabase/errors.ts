import type { PostgrestError } from '@supabase/supabase-js';

import { logger } from '@/services/logger';

/**
 * Turns backend failures into something safe to show a person.
 *
 * A raw Postgrest error names tables, columns, constraints and sometimes the
 * failing query. Rendering that leaks the schema to anyone who can trigger an
 * error, and tells the user nothing useful. Every message a user sees comes
 * from here; the real error goes to the redacting logger instead.
 */

export type AppErrorKind =
  'network' | 'unauthorized' | 'not_found' | 'conflict' | 'validation' | 'rate_limit' | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly userMessage: string;

  constructor(kind: AppErrorKind, userMessage: string) {
    super(userMessage);
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
  }
}

const MESSAGES: Record<AppErrorKind, string> = {
  network: "We couldn't reach your diary. Nothing has been lost — try again in a moment.",
  unauthorized: 'Please sign in again to continue.',
  not_found: "We couldn't find that entry.",
  conflict: 'That already exists.',
  validation: "That doesn't look quite right. Please check and try again.",
  rate_limit: 'That was a few too many attempts. Please wait a minute and try again.',
  unknown: 'Something went wrong. Your entries are safe.',
};

/** Postgres SQLSTATEs worth distinguishing. Everything else is `unknown`. */
function kindFor(code: string | undefined): AppErrorKind {
  switch (code) {
    case '23505': // unique_violation
      return 'conflict';
    case '23503': // foreign_key_violation — e.g. a thread in another diary
    case '23514': // check_violation
    case '22001': // string_data_right_truncation
      return 'validation';
    case '42501': // insufficient_privilege — an RLS policy said no
    case 'PGRST301': // JWT expired
      return 'unauthorized';
    case 'PGRST116': // no rows where exactly one was expected
      return 'not_found';
    default:
      return 'unknown';
  }
}

/**
 * `context` should describe the operation ("create entry"), never its content.
 * The logger redacts anyway, but the first line of defence is not passing
 * someone's diary text to a log call in the first place.
 */
export function toAppError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;

  // Checked before the Postgrest branch: an auth error carries `message` and
  // `code` too, so it would otherwise be looked up as a SQLSTATE, miss, and
  // tell someone with a mistyped password that something went wrong.
  if (isAuthError(error)) return toAuthError(error, context);

  if (isPostgrestError(error)) {
    const kind = kindFor(error.code);
    logger.error(`${context} failed`, { code: error.code, kind });
    return new AppError(kind, MESSAGES[kind]);
  }

  if (error instanceof TypeError && /network|fetch/i.test(error.message)) {
    logger.warn(`${context} failed: network unreachable`);
    return new AppError('network', MESSAGES.network);
  }

  logger.error(`${context} failed`, { error });
  return new AppError('unknown', MESSAGES.unknown);
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    ('code' in error || 'details' in error)
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Auth failures a person can act on.
 *
 * These are the one family of backend errors where a vague message is worse
 * than none: someone who has mistyped their password needs to be told that,
 * not reassured that their entries are safe. So auth errors get real copy —
 * within the limit that none of it may reveal whether an account exists.
 *
 * Anything not listed falls through to the generic message rather than
 * rendering whatever the provider happened to say.
 */
const AUTH_MESSAGES: Record<string, [AppErrorKind, string]> = {
  invalid_credentials: ['unauthorized', 'That email and password don’t match.'],
  email_not_confirmed: [
    'unauthorized',
    'Please confirm your email first — check your inbox for the link.',
  ],
  email_address_invalid: ['validation', 'That email address doesn’t look right.'],
  validation_failed: ['validation', 'Please check the details above and try again.'],
  weak_password: ['validation', 'Please choose a longer password — at least 8 characters.'],
  user_already_exists: ['conflict', 'That email already has an account. Try signing in instead.'],
  email_exists: ['conflict', 'That email already has an account. Try signing in instead.'],
  same_password: ['validation', 'That is already your password. Please choose a different one.'],
  signup_disabled: ['unauthorized', 'New accounts are closed at the moment.'],
  over_request_rate_limit: ['rate_limit', MESSAGES.rate_limit],
  over_email_send_rate_limit: [
    'rate_limit',
    'We’ve sent a few emails already. Please wait a minute before asking for another.',
  ],
  session_expired: ['unauthorized', MESSAGES.unauthorized],
  session_not_found: ['unauthorized', MESSAGES.unauthorized],
  refresh_token_not_found: ['unauthorized', MESSAGES.unauthorized],
};

interface AuthErrorLike {
  name: string;
  message: string;
  code?: string;
  status?: number;
}

function isAuthError(error: unknown): error is AuthErrorLike {
  if (typeof error !== 'object' || error === null) return false;
  if ('__isAuthError' in error) return true;
  return 'name' in error && typeof error.name === 'string' && error.name.startsWith('Auth');
}

/**
 * As `toAppError`, but for Supabase Auth.
 *
 * The error's own `message` is never rendered — it can name the provider, echo
 * the address back, or hint at whether the account exists. Only the mapped copy
 * above reaches a screen.
 */
export function toAuthError(error: unknown, context: string): AppError {
  if (error instanceof AppError) return error;

  if (isAuthError(error)) {
    // A dropped connection arrives as an auth error too, and telling someone
    // their password is wrong when their signal died is its own small cruelty.
    if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
      logger.warn(`${context} failed: network unreachable`);
      return new AppError('network', MESSAGES.network);
    }

    const mapped = error.code === undefined ? undefined : AUTH_MESSAGES[error.code];
    logger.error(`${context} failed`, { code: error.code, status: error.status });

    if (mapped !== undefined) return new AppError(mapped[0], mapped[1]);
    return new AppError('unknown', MESSAGES.unknown);
  }

  return toAppError(error, context);
}
