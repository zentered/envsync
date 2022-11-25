'use strict'

import { test } from 'tap'
import esmock from 'esmock'

test('fetchVariable() returns value from GCP', async ({ equal }) => {
  const { fetchVariable } = await esmock('../lib/fetchVariable.js', {
    '@google-cloud/secret-manager': {
      SecretManagerServiceClient: (() =>
        class {
          async accessSecretVersion(name) {
            return Promise.resolve([
              {
                payload: {
                  data: Buffer.from(name.name)
                }
              }
            ])
          }
        })()
    }
  })
  const [key, value] = await fetchVariable(
    'project',
    'testkey',
    'envsync//variable'
  )
  equal(key, 'testkey')
  equal(value, 'projects/project/secrets/variable/versions/latest')
})

test('fetchVariable() returns version from GCP', async ({ equal }) => {
  const { fetchVariable } = await esmock('../lib/fetchVariable.js', {
    '@google-cloud/secret-manager': {
      SecretManagerServiceClient: (() =>
        class {
          async accessSecretVersion(name) {
            return Promise.resolve([
              {
                payload: {
                  data: Buffer.from(name.name)
                }
              }
            ])
          }
        })()
    }
  })
  const [key, value] = await fetchVariable(
    'project',
    'testkey',
    'envsync//variable/1'
  )
  equal(key, 'testkey')
  equal(value, 'projects/project/secrets/variable/versions/1')
})
