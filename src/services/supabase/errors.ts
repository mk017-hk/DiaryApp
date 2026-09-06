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
  'network' | 'unauthorized' | 'not_found' | 'conflict' | 'validation' | 'unknown';

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
