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
  assert.equal(
    result.get('DATABASE_URL'),
    'postgresql://user:pass@localhost:5432/db?schema=public'
  )
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

  assert.equal(
    result.get('DATABASE_URL'),
    'postgresql://user:pass=123@localhost:5432/db'
  )
  assert.equal(result.get('JWT_SECRET'), 'abc123==')
})

test('readEnv() preserves spaces in values', () => {
  const envFile = `MESSAGE=Hello World
DATABASE_URL=postgresql://user:my pass@localhost:5432/db
QUOTED="value with spaces"
`

  const result = readEnv(envFile)

  assert.equal(result.get('MESSAGE'), 'Hello World')
  assert.equal(
    result.get('DATABASE_URL'),
    'postgresql://user:my pass@localhost:5432/db'
  )
  assert.equal(result.get('QUOTED'), 'value with spaces')
})

test('readEnv() parses double-quoted values and unescapes them', () => {
  const envFile = `A="value with spaces"
B="line1\\nline2"
C="has # hash"
D="say \\"hi\\" \\\\ back"
`

  const result = readEnv(envFile)

  assert.equal(result.get('A'), 'value with spaces')
  assert.equal(result.get('B'), 'line1\nline2')
  assert.equal(result.get('C'), 'has # hash')
  assert.equal(result.get('D'), 'say "hi" \\ back')
})

test('readEnv() parses single-quoted and backtick values without unescaping', () => {
  const envFile = `A='raw \\n stays # here'
B=\`tick "q" 'x'\`
`

  const result = readEnv(envFile)

  assert.equal(result.get('A'), 'raw \\n stays # here')
  assert.equal(result.get('B'), `tick "q" 'x'`)
})

test('readEnv() parses a multi-line quoted value', () => {
  const pem = '-----BEGIN KEY-----\nabc=\ndef\n-----END KEY-----'
  const envFile = `BEFORE=1
KEY="${pem}"
AFTER=2
`

  const result = readEnv(envFile)

  assert.equal(result.get('BEFORE'), '1')
  assert.equal(result.get('KEY'), pem)
  assert.equal(result.get('AFTER'), '2')
  assert.equal(result.size, 3)
})

test('readEnv() ignores a comment after a closing quote', () => {
  const result = readEnv('A="value" # comment\nB=2\n')

  assert.equal(result.get('A'), 'value')
  assert.equal(result.get('B'), '2')
})

test('readEnv() treats an unclosed quote as a plain value', () => {
  const result = readEnv('A="oops\nB=2\n')

  assert.equal(result.get('A'), '"oops')
  assert.equal(result.get('B'), '2')
})
