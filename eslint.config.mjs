// @ts-check
import baseConfig from '@volontariapp/eslint-config';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': ['error', { endOfLine: 'lf' }],
    },
  },
  prettierConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.mjs', '**/*.spec.ts', 'jest.*'],
  },
);
