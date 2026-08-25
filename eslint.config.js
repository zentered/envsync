import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import nodePlugin from 'eslint-plugin-n'
import jsonPlugin from 'eslint-plugin-json'
import markdown from '@eslint/markdown'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig([
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        fastify: 'readonly'
      }
    },
    plugins: { js, n: nodePlugin },
    extends: ['js/recommended', 'n/recommended-module'],
    rules: {
      'n/no-unpublished-import': [
        'error',
        {
          allowModules: ['tap', 'esmock']
        }
      ]
    }
  },
  {
    files: ['**/*.json'],
    ...jsonPlugin.configs.recommended
  },
  {
    files: ['**/*.md'],
    plugins: { markdown },
    extends: ['markdown/processor']
  },
  {
    files: ['eslint.config.js'],
    rules: {
      'n/no-unpublished-import': 'off'
    }
  },
  prettierConfig
])
