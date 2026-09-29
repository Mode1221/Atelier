import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'data', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  { files: ['src/**/*.js', 'test/**/*.js', 'e2e/**/*.js', 'scripts/**/*.js', '*.config.js'], languageOptions: { globals: globals.node } },
  { files: ['public/**/*.js'], languageOptions: { sourceType: 'script', globals: globals.browser } },
];
