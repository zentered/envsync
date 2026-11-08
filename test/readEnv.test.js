import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
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

test('readEnv() parses double-quoted values and unescapes \n only', () => {
  const envFile = `A="value with spaces"
B="line1\\nline2"
C="has # hash"
D="keep \\\\ both"
`

  const result = readEnv(envFile)

  assert.equal(result.get('A'), 'value with spaces')
  assert.equal(result.get('B'), 'line1\nline2')
  assert.equal(result.get('C'), 'has # hash')
  // same as node --env-file: backslashes stay
  assert.equal(result.get('D'), 'keep \\\\ both')
})

test('readEnv() parses single-quoted values without unescaping', () => {
  const result = readEnv(`A='raw \\n stays # here'\n`)

  assert.equal(result.get('A'), 'raw \\n stays # here')
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

test('readEnv() ignores a comment after a value', () => {
  const result = readEnv('A="value" # comment\nB=plain # comment\nC=3\n')

  assert.equal(result.get('A'), 'value')
  assert.equal(result.get('B'), 'plain')
  assert.equal(result.get('C'), '3')
})

test('readEnv() does not let a trailing backslash escape the closing quote', () => {
  const result = readEnv('KEY="C:\\path\\"\nAFTER="keep"\n')

  assert.equal(result.get('KEY'), 'C:\\path\\')
  assert.equal(result.get('AFTER'), 'keep')
})

test('readEnv() ignores a quote inside a commented assignment', () => {
  const result = readEnv('# KEY="x\nDB_PASS=secret\nZ=1\n')

  assert.equal(result.get('DB_PASS'), 'secret')
  assert.equal(result.get('Z'), '1')
  assert.equal(result.size, 2)
})

test('readEnv() does not let an unbalanced quote swallow the next keys', () => {
  const result = readEnv('A="oops\nDB_PASS=secret\nZ=1\n')

  assert.equal(result.get('A'), '"oops')
  assert.equal(result.get('DB_PASS'), 'secret')
  assert.equal(result.get('Z'), '1')
})

test('readEnv() matches node --env-file when a later quote closes the value', async () => {
  // Node itself reads this as one value, from the first quote to the next one.
  // readEnv() must not disagree with the process that consumes the file.
  const envFile = 'A="oops\nDB_PASS=secret\nZ="1"\n'
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsync-'))
  try {
    const file = path.join(tmpDir, '.env')
    await fs.writeFile(file, envFile)
    const { stdout } = await promisify(execFile)(
      'node',
      [
        `--env-file=${file}`,
        '-p',
        'JSON.stringify([process.env.A, process.env.DB_PASS, process.env.Z])'
      ],
      { cwd: tmpDir }
    )
    const [a, dbPass, z] = JSON.parse(stdout)

    const result = readEnv(envFile)
    assert.equal(result.get('A'), a)
    assert.equal(result.get('DB_PASS'), dbPass ?? undefined)
    assert.equal(result.get('Z'), z ?? undefined)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})
