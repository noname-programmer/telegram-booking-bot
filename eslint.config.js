// ESLint — автоматическая проверка кода на ошибки (запуск: npm run lint).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '.tgcloud/**', 'data/**', 'standalone/data/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  // Код бота работает в песочнице Telegram: только стандартный JavaScript, без Node.js.
  { files: ['tgcloud/**/*.js', 'examples/**/*.js'], languageOptions: { globals: { console: 'readonly' } } },
  // Тесты и запуск без Serverless работают в Node.js.
  { files: ['test/**/*.js', 'standalone/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
