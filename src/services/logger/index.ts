/**
 * The only sanctioned way to log.
 *
 * Journal entries are the most sensitive data this app holds, and device logs
 * are readable by anyone with physical access, by other tooling during
 * development, and by crash reporters later. Nothing that could contain entry
 * content, credentials or media paths may reach a log line, so this module
 * redacts by key name and refuses to serialise unknown objects wholesale.
 *
 * In production the console sinks are disabled entirely. When a crash reporter
 * is introduced it plugs in here — behind the same redaction — never alongside.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Anything whose key matches is replaced, regardless of nesting depth. */
const REDACTED_KEY_PATTERN =
  /(body|content|text|title|note|transcript|caption|token|password|secret|key|authorization|session|email|url|path|signedUrl|storagePath|location|people|tag)/i;

const REDACTED = '[redacted]';
const MAX_DEPTH = 3;

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    // Free strings can be anything. Keep only a length signal.
    return value.length > 0 ? `[string:${String(value.length)}]` : '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (depth >= MAX_DEPTH) return '[depth-limit]';

  if (Array.isArray(value)) {
    return `[array:${String(value.length)}]`;
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = REDACTED_KEY_PATTERN.test(key) ? REDACTED : redact(nested, depth + 1);
    }
    return out;
  }

  return '[unserialisable]';
}

const isDev = process.env.NODE_ENV !== 'production';

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!isDev) return;

  const safeContext = context === undefined ? undefined : redact(context);
  const sink =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.log;

  if (safeContext === undefined) {
    sink(`[${level}] ${message}`);
  } else {
    sink(`[${level}] ${message}`, safeContext);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  /**
   * `message` must be a developer-authored string, never a backend error.
   * Pass the caught value in `context` so it goes through redaction.
   */
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};

/** Exported for tests — not part of the logging surface. */
export const __testing = { redact };
