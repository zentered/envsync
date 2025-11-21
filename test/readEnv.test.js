import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEnv } from '../lib/readEnv.js'

test('readEnv() parses .env file into Map', () => {
  const envFile = `GCP_PROJECT=myproject-dev
NODE_ENV=development
API_URL=http://localhost:3000

AUTH0_CLIENT_SECRET=secret-value
DATABASE_URL=postgresql://user:pass@localhost:5432/db?schema=public
`

  const result = readEnv(envFile)

  assert.equal(result.get('GCP_PROJECT'), 'myproject-dev')
  assert.equal(result.get('NODE_ENV'), 'development')
  assert.equal(result.get('API_URL'), 'http://localhost:3000')
  assert.equal(result.get('AUTH0_CLIENT_SECRET'), 'secret-value')
  assert.equal(result.get('DATABASE_URL'), 'postgresql://user:pass@localhost:5432/db?schema=public')
  assert.equal(result.size, 5)
})

test('readEnv() handles empty lines', () => {
  const envFile = `KEY1=value1


KEY2=value2
`

  const result = readEnv(envFile)

  assert.equal(result.get('KEY1'), 'value1')
  assert.equal(result.get('KEY2'), 'value2')
  assert.equal(result.size, 2)
})

test('readEnv() handles values with equals signs', () => {
  const envFile = `DATABASE_URL=postgresql://user:pass=123@localhost:5432/db
JWT_SECRET=abc123==
`

  const result = readEnv(envFile)

  assert.equal(result.get('DATABASE_URL'), 'postgresql://user:pass=123@localhost:5432/db')
  assert.equal(result.get('JWT_SECRET'), 'abc123==')
})
