// ESLint: the linter — finds problems and enforces the rules Prettier (the
// formatter) does not cover. Run `npm run lint`, or `npm run lint:fix` to let
// it fix what it can. The same file is used in sibling projects of the
// workspace; keep them in step.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default defineConfig(
  {
    ignores: [
      'dist/',
      'dev-dist/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'public/',
    ],
  },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'], svelteConfig },
    },
  },
  {
    rules: {
      // readability: a body always gets braces and its own lines
      curly: ['error', 'all'],
      // one variable per declaration: no "const a = 1, b = 2"
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      // a leading underscore marks a name that is deliberately unused
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // a ? b : c ? d : e is hard to read
      'no-nested-ternary': 'warn',
      // charts and the floor plan are SVG strings the app builds itself and
      // inserts with {@html}; anything user-typed in them goes through esc()
      'svelte/no-at-html-tags': 'off',
    },
  },
);
