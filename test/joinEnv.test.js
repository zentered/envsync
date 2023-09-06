import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinEnv } from '../lib/joinEnv.js'

test('joinEnv() returns value from GCP', () => {
  const actual = joinEnv([['testkey', 'testvalue']])
  assert.equal(actual, 'testkey=testvalue')
})
