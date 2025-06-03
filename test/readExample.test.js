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
  `
  const actual = await readExample(file)
  const expected = [
    ['GCP_PROJECT', 'quillcy'],
    ['NODE_ENV', 'development'],
    [''],
    ['AUTH0_CLIENT_SECRET', 'envsync//testkey/latest'],
    ['']
  ]
  assert.deepStrictEqual(actual, expected)
})
