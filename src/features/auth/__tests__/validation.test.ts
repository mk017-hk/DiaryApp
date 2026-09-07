import { emailError, MIN_PASSWORD_LENGTH, passwordError, signInPasswordError } from '../validation';

describe('email', () => {
  it.each([
    'bella@example.com',
    'b@e.co',
    'first.last+diary@sub.domain.co.uk',
    'someone@example.test',
  ])('accepts %s', (email) => {
    expect(emailError(email)).toBeUndefined();
  });

  it.each(['', '   ', 'bella', 'bella@', '@example.com', 'bella@example', 'bella example.com'])(
    'rejects %p',
    (email) => {
      expect(emailError(email)).toBeDefined();
    },
  );

  it('ignores surrounding whitespace, which phone keyboards add freely', () => {
    expect(emailError('  bella@example.com  ')).toBeUndefined();
  });
});

describe('a new password', () => {
  it('requires the length the server requires, and no more', () => {
    expect(passwordError('a'.repeat(MIN_PASSWORD_LENGTH))).toBeUndefined();
    expect(passwordError('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBeDefined();
  });

  // Composition rules push people towards Password1! and away from the long
  // phrase that is actually harder to guess. There are none, deliberately, and
  // this is the test that keeps someone from adding one later.
  it('accepts a long passphrase with no digits, symbols or capitals', () => {
    expect(passwordError('the kitchen light was still on')).toBeUndefined();
  });

  it('does not trim — a password is exactly what was typed', () => {
    expect(passwordError('  a  ')).toBeDefined();
  });

  it('says nothing about the account when it complains', () => {
    expect(passwordError('short')).not.toContain('account');
  });
});

describe('signing in', () => {
  // Any password may be the right one; rejecting a short password here would
  // lock out anyone who set one before the rule existed.
  it('accepts a password shorter than a new one may be', () => {
    expect(signInPasswordError('abc')).toBeUndefined();
  });

  it('still asks for something', () => {
    expect(signInPasswordError('')).toBeDefined();
  });
});
