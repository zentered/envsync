'use strict'

import { test } from 'tap'
import { joinEnv } from '../lib/joinEnv.js'

test('joinEnv() returns value from GCP', async ({ equal }) => {
  const actual = joinEnv([['testkey', 'testvalue']])
  equal(actual, 'testkey=testvalue')
})
