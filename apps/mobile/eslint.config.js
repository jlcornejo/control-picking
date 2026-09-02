// ESLint v9 flat config para la app mobile (Expo / React Native + TypeScript).
// Reemplaza el antiguo formato .eslintrc (removido en ESLint v9).
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsparser = require('@typescript-eslint/parser');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
  // Artefactos que no deben lintarse.
  {
    ignores: ['dist/**', 'node_modules/**', '.expo/**', 'babel.config.js', 'metro.config.js'],
  },

  // Base recomendada de JavaScript.
  js.configs.recommended,

  // Reglas para TypeScript / TSX.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Entorno React Native / Expo.
        __DEV__: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // no-undef lo cubre TypeScript; evita falsos positivos con tipos globales.
      'no-undef': 'off',
      // Preferir la regla de TS para variables sin usar (permite prefijo _).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Alinear con la convención del proyecto: prohibido `any`.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Permitir `catch {}` vacío: patrón intencional para efectos opcionales
      // (p. ej. háptica) cuyo fallo no debe interrumpir el flujo.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
