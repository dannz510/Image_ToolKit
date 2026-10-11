/*
 * ESLint configuration for Dannz AI Studio.
 *
 * Type-aware rules that need the compiler are deliberately NOT enabled
 * (lint stays fast and needs no project-wide tsc run): the project already
 * gates correctness with `npm run typecheck` (tsc --noEmit), so lint focuses
 * on bugs and hooks discipline only.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'node_modules', 'api', 'scripts', '*.cjs', '*.js'],
  rules: {
    // --- errors that actually catch bugs -------------------------------------
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-undef': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    'no-alert': 'warn',
    'no-var': 'error',
    'prefer-const': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-implicit-globals': 'error',
    'no-return-assign': 'error',
    'no-self-compare': 'error',
    'no-throw-literal': 'error',
    'no-with': 'error',
    'no-label-var': 'error',
    radix: 'error',
    'no-caller': 'error',
    'no-extend-native': 'error',
    'no-iterator': 'error',
    'no-multi-str': 'error',
    'no-proto': 'error',
    'no-octal-escape': 'error',
    // `void promise()` is this codebase's deliberate "fire and forget, error
    // handled inside" marker - allow it.
    'no-void': 'off',

    // --- React hooks ---------------------------------------------------------
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      files: ['**/*.tsx'],
      rules: {
        // Button/label ids come from the design system, not from lint.
        'no-undef': 'off',
      },
    },
  ],
};
