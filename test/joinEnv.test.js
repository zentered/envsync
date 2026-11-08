import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { joinEnv } from '../lib/joinEnv.js'
import { readEnv } from '../lib/readEnv.js'

const execFileAsync = promisify(execFile)

// Parse a .env string the way `node --env-file` does, in a child process.
async function parseWithNode(content) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsync-'))
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

test('joinEnv() leaves values unquoted when they read back unchanged', () => {
  const values = [
    'Hello World',
    'postgresql://user:pass=1@localhost:5432/db?schema=public',
    '',
    'Ab"c\'d`e=f\\g',
    'a$b',
    'say "hi" and it\'s fine',
    'C:\\path\\new'
  ]
  for (const value of values) {
    assert.equal(joinEnv([['K', value]]), `K=${value}`, JSON.stringify(value))
  }
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

test('joinEnv() quotes a value that starts and ends with a quote', () => {
  assert.equal(joinEnv([['KEY', '"x"']]), `KEY='"x"'`)
})

test('joinEnv() uses single quotes for a multi-line value with backslashes', () => {
  assert.equal(joinEnv([['KEY', 'a\\nb\nc']]), `KEY='a\\nb\nc'`)
})

test('joinEnv() refuses a value no quote style can carry, naming the key and why', () => {
  assert.throws(
    () => joinEnv([['BAD_KEY', `it's "both" # x`]]),
    (err) => {
      assert.match(err.message, /BAD_KEY/)
      assert.match(err.message, /single quote/)
      assert.match(err.message, /double quote/)
      assert.match(err.message, /backtick/i)
      return true
    }
  )
  assert.throws(
    () => joinEnv([['CR_KEY', 'a\rb']]),
    (err) => {
      assert.match(err.message, /CR_KEY/)
      assert.match(err.message, /carriage return/)
      return true
    }
  )
})

test('joinEnv() output reads back through readEnv() and node --env-file', async () => {
  const values = {
    PEM: pem,
    HASH: 'pass#word # more',
    DOUBLE: 'say "hi"',
    SINGLE: "it's",
    BACKSLASH: 'C:\\path\\new',
    BACKSLASH_N: 'literal \\n here',
    BACKSLASH_MULTI: 'a\\b\nc',
    JSON: '{"type":"service_account","private_key":"-----BEGIN-----\\nabc\\n-----END-----\\n"}',
    SPECIAL: 'Ab"c\'d`e=f\\g',
    PLAIN: 'plain',
    EMPTY: ''
  }
  const out = joinEnv([['GCP_PROJECT', 'p'], [''], ...Object.entries(values)])

  const read = readEnv(out)
  const parsed = await parseWithNode(out)
  for (const [key, value] of Object.entries(values)) {
    assert.equal(read.get(key), value, `readEnv ${key}`)
    assert.equal(parsed[key], value, `node --env-file ${key}`)
  }
})

for (const quote of ['"', "'", '`']) {
  test(`joinEnv() does not let an unclosed leading ${quote} swallow the next keys`, () => {
    const entries = [
      ['A', `${quote}abc`],
      ['B', `x y${quote}z`],
      ['C', '1']
    ]

    const out = joinEnv(entries)

    assert.deepEqual([...readEnv(out)], entries)
  })
}

// Deterministic PRNG so a failure is reproducible.
function prng(seed) {
  let state = seed
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

// Node drops CR, and with a `'` the only quote left is `"`, which cannot hold
// a `"` or a literal backslash-n (Node unescapes it).
const isRefusable = (value) =>
  value.includes('\r') ||
  (value.includes("'") && (value.includes('"') || value.includes('\\n')))

test('joinEnv() property: every file reads back exactly or is refused', () => {
  const alphabet = [
    '\n',
    '\r',
    '"',
    "'",
    '`',
    '\\',
    '#',
    '=',
    '$',
    ' ',
    '\t',
    'a',
    'b',
    'n',
    'export'
  ]
  const random = prng(20260109)
  const randomValue = () => {
    let value = ''
    const length = Math.floor(random() * 10)
    for (let i = 0; i < length; i++) {
      value += alphabet[Math.floor(random() * alphabet.length)]
    }
    return value
  }
  let refused = 0

  for (let run = 0; run < 5000; run++) {
    const entries = []
    const count = 1 + Math.floor(random() * 4)
    for (let i = 0; i < count; i++) entries.push([`KEY${i}`, randomValue()])
    const label = JSON.stringify(entries)

    let out
    try {
      out = joinEnv(entries)
    } catch (err) {
      refused++
      const key = err.message.match(/Cannot write (KEY\d)/)?.[1]
      assert.ok(key, `unexpected error ${err.message} for ${label}`)
      // refusal is only allowed for a value Node cannot carry
      const value = entries.find(([k]) => k === key)[1]
      assert.ok(isRefusable(value), `refused a writable value in ${label}`)
      continue
    }

    assert.deepEqual([...readEnv(out)], entries, label)
  }

  // the property test must exercise both outcomes
  assert.ok(refused > 0)
})
