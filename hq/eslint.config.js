import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'test-results', 'playwright-report', 'public/js/sealed.js', '.wrangler'] },
  js.configs.recommended,
  { files: ['test/**/*.js', 'e2e/**/*.js', 'scripts/**/*.mjs', 'vendor-src/**/*.js', '*.config.js', 'public/templates/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['public/js/**/*.js'], languageOptions: { globals: globals.browser } },
];
