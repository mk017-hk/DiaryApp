import { AppError, toAppError, toAuthError } from '../errors';

jest.mock('@/services/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

/**
 * Shaped like the errors supabase-js actually throws: an AuthApiError carries
 * a name beginning with "Auth", a string `code`, and an HTTP `status`.
 */
function authError(code: string, message = 'raw provider text', status = 400) {
  const error = new Error(message) as Error & {
    name: string;
    code: string;
    status: number;
    __isAuthError: boolean;
  };
  error.name = 'AuthApiError';
  error.code = code;
  error.status = status;
  error.__isAuthError = true;
  return error;
}

describe('auth errors a person can act on', () => {
  it('says the password was wrong rather than that something went wrong', () => {
    const result = toAuthError(authError('invalid_credentials'), 'sign in');

    expect(result.kind).toEqual('unauthorized');
    expect(result.userMessage).toEqual('That email and password don’t match.');
  });

  it('distinguishes an unconfirmed email from a wrong password', () => {
    expect(toAuthError(authError('email_not_confirmed'), 'sign in').userMessage).toContain(
      'confirm your email',
    );
  });

  // Password reset stays silent about whether the address has an account, so
  // rate limiting is the one failure it may report — and it needs its own kind
  // to be told apart from "we sent it".
  it('marks rate limiting as its own kind', () => {
    const result = toAuthError(authError('over_email_send_rate_limit', 'too many', 429), 'reset');

    expect(result.kind).toEqual('rate_limit');
  });

  it('reads a dropped connection as a network problem, not a bad password', () => {
    const dropped = new Error('failed to fetch') as Error & {
      name: string;
      __isAuthError: boolean;
    };
    dropped.name = 'AuthRetryableFetchError';
    dropped.__isAuthError = true;

    const result = toAuthError(dropped, 'sign in');

    expect(result.kind).toEqual('network');
    expect(result.userMessage).toContain('Nothing has been lost');
  });
});

describe('what auth errors must never say', () => {
  // The provider's own text can name the service, quote the address back, or
  // describe the failure precisely enough to confirm an account exists.
  it('never renders the provider’s own message', () => {
    const result = toAuthError(
      authError('invalid_credentials', 'User bella@example.com not found in project xyz'),
      'sign in',
    );

    expect(result.userMessage).not.toContain('bella@example.com');
    expect(result.userMessage).not.toContain('xyz');
  });

  it('falls back to the generic message for a code it does not know', () => {
    const result = toAuthError(authError('some_new_code_from_2027', 'internals leak'), 'sign in');

    expect(result.kind).toEqual('unknown');
    expect(result.userMessage).toEqual('Something went wrong. Your entries are safe.');
    expect(result.userMessage).not.toContain('internals');
  });

  // Whether an email has an account here is not a question this app answers:
  // it would reveal who keeps a diary. Sign-in copy must read the same either
  // way, and only the deliberate sign-up conflict may differ.
  it('says the same thing whether or not the account exists', () => {
    const wrongPassword = toAuthError(authError('invalid_credentials'), 'sign in').userMessage;
    const noSuchUser = toAuthError(
      authError('invalid_credentials', 'user not found'),
      'sign in',
    ).userMessage;

    expect(wrongPassword).toEqual(noSuchUser);
  });
});

describe('routing between the two error families', () => {
  // An auth error has `message` and `code` too, so the generic path would
  // otherwise look its code up as a SQLSTATE, miss, and go vague.
  it('recognises an auth error passed to toAppError', () => {
    expect(toAppError(authError('invalid_credentials'), 'sign in').kind).toEqual('unauthorized');
  });

  it('still maps Postgrest errors by SQLSTATE', () => {
    const conflict = { message: 'duplicate key', code: '23505', details: '', hint: '' };
    expect(toAppError(conflict, 'create entry').kind).toEqual('conflict');
  });

  it('passes an AppError straight through, unwrapped', () => {
    const original = new AppError('validation', 'Say something first.');
    expect(toAuthError(original, 'sign up')).toBe(original);
  });

  it('hands a non-auth error to the generic path', () => {
    expect(toAuthError(new Error('something else'), 'sign in').kind).toEqual('unknown');
  });
});
