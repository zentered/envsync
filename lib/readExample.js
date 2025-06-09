'use strict'

import { fetchVariable } from './fetchVariable.js'

let gcpProjectId

function shouldSync(value) {
  return value?.indexOf('envsync//') > -1
}

export async function readExample(exampleFile) {
  const output = []
  exampleFile
    .split('\n')
    .map((line) => line.split(/=(.*)/s))
    .map(([key, value]) => {
      key = key.replace(/\s/g, '')
      value = value?.replace(/\s/g, '')

      // set gcp project id for secret manager
      if (key === 'GCP_PROJECT') {
        gcpProjectId = value
      } else if (key === 'GCLOUD_PROJECT_ID') {
        gcpProjectId = value
      }

      if (shouldSync(value)) {
        if (!gcpProjectId) {
          throw new Error(`Missing GCP_PROJECT or GCLOUD_PROJECT_ID`)
        }
        output.push(fetchVariable(gcpProjectId, key, value))
      } else {
        // if not a secret, return the key/value
        if (key === '') {
          output.push([key])
        } else {
          output.push([key, value])
        }
      }
    })

  return Promise.all(output)
}
