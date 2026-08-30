const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.expo/**',
      'ios/**',
      'android/**',
    ],
  },
  {
    rules: {
      // Journal content is highly sensitive. Direct console use risks leaking
      // entry bodies, tokens or storage paths into device logs — use the
      // redacting logger in src/services/logger instead.
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/services/supabase/client'],
              importNames: ['supabase'],
              message:
                'Do not use the Supabase client directly in UI code. Go through a repository in src/services/supabase/.',
            },
          ],
        },
      ],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // The logger is the one place allowed to reach the real console.
    files: ['src/services/logger/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', 'jest.setup.js'],
    languageOptions: {
      globals: {
        afterAll: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
];
