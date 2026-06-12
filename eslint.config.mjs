import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const nodeGlobals = {
  console: 'readable',
  process: 'readable',
  Buffer: 'readable',
  __dirname: 'readable',
  __filename: 'readable',
  require: 'readable',
  setTimeout: 'readable',
  clearTimeout: 'readable',
  setInterval: 'readable',
  clearInterval: 'readable',
  global: 'readable',
  URL: 'readable',
  fetch: 'readable',
  WebAssembly: 'readable',
  TextDecoder: 'readable',
  TextEncoder: 'readable',
  crypto: 'readable',
  atob: 'readable',
  btoa: 'readable',
  performance: 'readable',
  navigator: 'readable',
  indexedDB: 'readable',
  postMessage: 'readable',
  self: 'readable',
  XMLHttpRequest: 'readable',
  clearImmediate: 'readable',
  setImmediate: 'readable',
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'website',
      'coverage',
      'node_modules',
      'vendor',
      'public/vendor',
      'scratch',
      'pbn',
      'playwright-report',
      'test-results',
      'test-output',
      'generate-large.js',
      'generate-large.mjs',
      'backlink-directories-*.csv',
      'e2e-ocr.log',
      'mockup-*.html',
      'mockup.html',
      '.well-known',
      'website/blog-urls.txt',
      'website/INDEXNOW_SETUP_SUMMARY.md',
      'website/indexnow-submit.js',
      'website/submit-batch.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      'prefer-const': 'warn',
      'no-control-regex': 'warn',
    },
  },

  {
    files: ['scripts/**/*.{js,mjs,cjs,ts}'],
    languageOptions: { globals: { ...nodeGlobals } },
    rules: {
      'no-undef': 'off',
      'no-useless-escape': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  {
    files: ['api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat['jsx-runtime'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'e2e/**/*.ts'],
    rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unused-expressions': 'off',
          'no-control-regex': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['build-vercel.mjs'],
    languageOptions: { globals: { ...nodeGlobals } },
    rules: { 'no-undef': 'off' },
  },
);
