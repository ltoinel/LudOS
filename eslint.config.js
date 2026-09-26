import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  {
    // Generated output and archives, plus content linted separately (root/).
    ignores: [
      'dist/',
      '.astro/',
      '.assets-archive/',
      'coverage/',
      'reports/',
      'deploy/generated/',
      'node_modules/',
      'root/',
      'public/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  // Browser code: the client shell and Astro components.
  {
    files: ['src/**/*.{ts,astro}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Node code: build scripts, the msg relay, config and tests.
  {
    files: ['scripts/**/*.ts', 'server/**/*.ts', '*.{js,ts,mjs}', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
];
