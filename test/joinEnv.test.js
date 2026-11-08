import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { joinEnv } from '../lib/joinEnv.js'
import { readEnv } from '../lib/readEnv.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Parse a .env string the way `node --env-file` does, in a child process.
async function parseWithNode(content) {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  try {
    const file = path.join(tmpDir, '.env')
    await fs.writeFile(file, content)
    const { stdout } = await execFileAsync(
      'node',
      [`--env-file=${file}`, '-p', 'JSON.stringify(process.env)'],
      { cwd: tmpDir }
    )
    return JSON.parse(stdout)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

const pem =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\nabc/+=\n-----END PRIVATE KEY-----\n'

test('joinEnv() returns value from GCP', () => {
  const actual = joinEnv([['testkey', 'testvalue']])
  assert.equal(actual, 'testkey=testvalue')
})

test('joinEnv() leaves plain values unquoted', () => {
  const actual = joinEnv([
    ['A', 'Hello World'],
    ['B', 'postgresql://user:pass=1@localhost:5432/db?schema=public'],
    ['C', '']
  ])
  assert.equal(
    actual,
    'A=Hello World\nB=postgresql://user:pass=1@localhost:5432/db?schema=public\nC='
  )
})

test('joinEnv() escapes newlines in a multi-line value', () => {
  const actual = joinEnv([['KEY', pem]])
  assert.equal(actual.split('\n').length, 1)
  assert.equal(
    actual,
    'KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADAN\\nabc/+=\\n-----END PRIVATE KEY-----\\n"'
  )
})

test('joinEnv() quotes a value containing #', () => {
  assert.equal(joinEnv([['KEY', 'pass#word']]), 'KEY="pass#word"')
})

test('joinEnv() quotes a value with leading or trailing whitespace', () => {
  assert.equal(joinEnv([['KEY', ' padded ']]), 'KEY=" padded "')
})

test('joinEnv() output round-trips through readEnv() and node --env-file', async () => {
  const values = {
    PEM: pem,
    HASH: 'pass#word # more',
    DOUBLE: 'say "hi"',
    SINGLE: "it's",
    BACKSLASH: 'C:\\path\\new',
    BACKSLASH_N: 'literal \\n here',
    CR: 'a\r\nb',
    MIXED: `it's "both" \`and\` back\\slash\nnewline #`,
    JSON: '{"type":"service_account","private_key":"-----BEGIN-----\\nabc\\n-----END-----\\n"}',
    PLAIN: 'plain',
    EMPTY: ''
  }
  const out = joinEnv([['GCP_PROJECT', 'p'], [''], ...Object.entries(values)])

  const read = readEnv(out)
  for (const [key, value] of Object.entries(values)) {
    assert.equal(read.get(key), value, `readEnv ${key}`)
  }

  const parsed = await parseWithNode(out)
  for (const [key, value] of Object.entries(values)) {
    // MIXED needs all three quote types, see joinEnv.js. Node converts CRLF to LF.
    if (key === 'MIXED' || key === 'CR') continue
    assert.equal(parsed[key], value, `node --env-file ${key}`)
  }
})
