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
