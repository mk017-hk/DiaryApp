/**
 * Integration tests against a running local Supabase stack.
 *
 * Kept separate from the unit suite because these need Docker and take real
 * time. `npm test` stays fast; `npm run test:rls` proves the security model.
 */
module.exports = {
  displayName: 'rls',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
  // The Edge Functions are Deno and import with explicit `.ts` extensions.
  // Mapping that away lets their pure modules — the assistant's copy rules,
  // above all — be tested here rather than only through a running function.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.ts$': '$1' },
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
};
