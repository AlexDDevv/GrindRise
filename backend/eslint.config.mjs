// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // database.types.ts est généré par `pnpm db:types` : le corriger n'aurait
    // aucun effet, la prochaine régénération l'écraserait.
    //
    // contract.ts est le fichier jumeau du contrat de queue, partagé à
    // l'identique avec le dépôt grindrise-notifications
    // (src/queue/contract.ts). Il ne doit jamais être reformaté ni corrigé
    // ici : la copie source de ce dépôt fait foi, et toute modification
    // locale casserait l'invariant octet pour octet entre les deux dépôts.
    ignores: [
      'eslint.config.mjs',
      'src/database.types.ts',
      'src/modules/notifications/contract.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      // Le préfixe `_` marque un paramètre volontairement inutilisé — courant
      // dans les signatures de squelette encore à implémenter.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
