import { test } from 'node:test'
import assert from 'node:assert/strict'
import esmock from 'esmock'

test('joinEnv() returns value from GCP', async () => {
  const { readExample } = await esmock('../lib/readExample.js', {
    '../lib/fetchVariable.js': {
      fetchVariable: async (gcpProjectId, key, value) => {
        return [key, value]
      }
    }
  })

  const file = `GCP_PROJECT = quillcy
  NODE_ENV = development
  
  AUTH0_CLIENT_SECRET=envsync//testkey/latest
  DATABASE_URL=postgresql://hello:world@localhost:5432/postgres?schema=example
  `

  const actual = await readExample(file)
  const expected = [
    ['GCP_PROJECT', 'quillcy'],
    ['NODE_ENV', 'development'],
    [''],
    ['AUTH0_CLIENT_SECRET', 'envsync//testkey/latest'],
    [
      'DATABASE_URL',
      'postgresql://hello:world@localhost:5432/postgres?schema=example'
    ],
    ['']
  ]
  assert.deepStrictEqual(actual, expected)
})

test('readExample() unquotes literal values and drops inline comments', async () => {
  const { readExample } = await esmock('../lib/readExample.js', {
    '../lib/fetchVariable.js': {
      fetchVariable: async (gcpProjectId, key, value) => [key, value]
    }
  })

  const actual = await readExample(`GCP_PROJECT=quillcy
# a comment line
A=foo # note
B="v" # note
QUOTED="value with # hash"
UNBALANCED="oops
EMPTY=
`)

  assert.deepEqual(actual, [
    ['GCP_PROJECT', 'quillcy'],
    ['# a comment line', undefined],
    ['A', 'foo'],
    ['B', 'v'],
    ['QUOTED', 'value with # hash'],
    ['UNBALANCED', '"oops'],
    ['EMPTY', ''],
    ['']
  ])
})
