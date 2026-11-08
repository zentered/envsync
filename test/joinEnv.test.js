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

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsync-'))
  try {
    return await fn(tmpDir)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

// Parse a .env string the way `node --env-file` does, in a child process.
const parseWithNode = (content) =>
  withTmpDir(async (tmpDir) => {
    const file = path.join(tmpDir, '.env')
    await fs.writeFile(file, content)
    const { stdout } = await execFileAsync(
      'node',
      [`--env-file=${file}`, '-p', 'JSON.stringify(process.env)'],
      { cwd: tmpDir }
    )
    return JSON.parse(stdout)
  })

// Source a .env string in sh. `INJ` is a function that records that it ran.
// Returns how often INJ ran and the value of each variable.
const sourceInSh = (content, keys) =>
  withTmpDir(async (tmpDir) => {
    await fs.writeFile(path.join(tmpDir, 'f'), content)
    const marker = path.join(tmpDir, 'marker')
    const printAll = keys.map((key) => `printf '%s\\0' "$${key}"`).join('; ')
    let stdout
    try {
      ;({ stdout } = await execFileAsync(
        'sh',
        ['-c', `INJ() { echo ran >> '${marker}'; }; . ./f; ${printAll}`],
        { cwd: tmpDir }
      ))
    } catch (err) {
      // a syntax error in the file is also a failure
      throw new Error(`sh failed: ${err.stderr}`, { cause: err })
    }
    const runs = await fs
      .readFile(marker, 'utf8')
      .then((text) => text.split('\n').filter(Boolean).length)
      .catch(() => 0)
    return { runs, values: stdout.split('\0').slice(0, keys.length) }
  })

const pem =
  '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\nabc/+=\n-----END PRIVATE KEY-----\n'

test('joinEnv() returns value from GCP', () => {
  const actual = joinEnv([['testkey', 'testvalue']])
  assert.equal(actual, 'testkey=testvalue')
})

test('joinEnv() writes only shell-safe characters bare', () => {
  const values = ['testvalue', 'a_b-c.d/e:f=g@h%i+j,k', 'ABC123', '']
  for (const value of values) {
    assert.equal(joinEnv([['K', value]]), `K=${value}`, JSON.stringify(value))
  }
})

test('joinEnv() single-quotes every other value', () => {
  const values = [
    'Hello World',
    'postgresql://user:pass=1@localhost:5432/db?schema=public',
    'abc; printf injected',
    'x;INJ',
    'a|b',
    'a&b',
    'a>b',
    '(x)',
    'abc$(printf injected)#',
    '$HOME',
    '${X}',
    'a`b`c',
    'pass#word',
    ' padded ',
    '"x"',
    'say "hi"',
    'C:\\path\\new',
    'literal \\n here',
    pem
  ]
  for (const value of values) {
    assert.equal(joinEnv([['K', value]]), `K='${value}'`, JSON.stringify(value))
  }
})

test('joinEnv() output is inert and exact when sourced by a shell', async () => {
  const values = {
    A: 'abc; printf injected',
    B: 'x;INJ',
    C: 'a|b',
    D: 'a&b',
    E: 'Hello World',
    F: 'a>b',
    G: '(x)',
    H: 'abc$(INJ)#',
    I: '`INJ`',
    J: pem,
    K: "it's fine",
    L: 'plain'
  }
  const out = joinEnv(Object.entries(values))

  const { runs, values: sh } = await sourceInSh(out, Object.keys(values))

  assert.equal(runs, 0)
  assert.deepEqual(sh, Object.values(values))
})

test('joinEnv() uses double quotes for a value with a single quote when that is inert', () => {
  assert.equal(joinEnv([['K', "it's fine"]]), `K="it's fine"`)
  assert.equal(joinEnv([['K', "it's\nmulti # x"]]), `K="it's\nmulti # x"`)
})

test('joinEnv() refuses a value with a single quote and no inert form, naming the key', () => {
  for (const value of [
    `it's "both" # x`,
    "it's $HOME",
    "it's `x`",
    "it's a\\b"
  ]) {
    assert.throws(
      () => joinEnv([['BAD_KEY', value]]),
      (err) => {
        assert.match(err.message, /BAD_KEY/)
        assert.match(err.message, /single quote/)
        assert.match(err.message, /shell/i)
        assert.doesNotMatch(err.message, /HOME|both/)
        return true
      },
      value
    )
  }
  assert.throws(
    () => joinEnv([['CR_KEY', 'a\rb']]),
    (err) => {
      assert.match(err.message, /CR_KEY/)
      assert.match(err.message, /carriage return/)
      return true
    }
  )
})

test('joinEnv() passes comment entries through unchanged, with no checks', () => {
  const actual = joinEnv([
    ['# EXAMPLE', `don't use $HOME "or" \`x\` \\ # y`],
    ['# plain note', undefined],
    ['K', 'v']
  ])

  assert.equal(
    actual,
    `# EXAMPLE=don't use $HOME "or" \`x\` \\ # y\n# plain note=undefined\nK=v`
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
    SPECIAL: 'Ab"cd`e=f\\g',
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

// Node drops CR. A value with a `'` has no form that Node reads exactly and a
// shell does not expand when it also has `"`, `\`, `$` or a backtick.
const isRefusable = (value) =>
  value.includes('\r') || (value.includes("'") && /["\\$`]/.test(value))

test('joinEnv() property: every file reads back exactly or is refused, and is inert in sh', async () => {
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
    ';',
    '|',
    '&',
    '>',
    '(',
    ')',
    '*',
    '?',
    '~',
    '!',
    'a',
    'b',
    'n',
    'export',
    'INJ',
    ';INJ;',
    '$(INJ)',
    '`INJ`'
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
  const shellSample = []

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
      // refusal is only allowed for a value no safe form can carry
      const value = entries.find(([k]) => k === key)[1]
      assert.ok(isRefusable(value), `refused a writable value in ${label}`)
      continue
    }

    assert.deepEqual([...readEnv(out)], entries, label)
    if (shellSample.length < 300) shellSample.push([entries, out])
  }

  // the property test must exercise both outcomes
  assert.ok(refused > 0)

  // a sample of the written files is sourced in sh: nothing runs, values exact
  for (const [entries, out] of shellSample) {
    const keys = entries.map(([key]) => key)
    const { runs, values } = await sourceInSh(out, keys)
    const label = JSON.stringify(entries)
    assert.equal(runs, 0, `INJ ran for ${label}`)
    assert.deepEqual(
      values,
      entries.map(([, value]) => value),
      label
    )
  }
})
