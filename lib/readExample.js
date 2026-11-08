'use strict'

import { fetchVariable } from './fetchVariable.js'
import { parseValue } from './readEnv.js'

let gcpProjectId

function shouldSync(value) {
  return value?.indexOf('envsync//') > -1
}

// Group physical lines into logical lines. A value that opens a quote with no
// closing quote on its line continues up to the next line that contains that
// quote, as Node reads it. Without such a line it stays one line. Comment
// lines are skipped.
function logicalLines(text) {
  const lines = text.split('\n')
  const grouped = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const value = line.trimStart().startsWith('#')
      ? undefined
      : line.split(/=(.*)/s)[1]?.trimStart()
    const quote = value?.[0]
    if (quote && `"'\``.includes(quote) && !value.includes(quote, 1)) {
      const close = lines.findIndex((l, j) => j > i && l.includes(quote))
      if (close !== -1) {
        line = lines.slice(i, close + 1).join('\n')
        i = close
      }
    }
    grouped.push(line)
  }
  return grouped
}

export async function readExample(exampleFile) {
  const output = []
  logicalLines(exampleFile)
    .map((line) => line.split(/=(.*)/s))
    .map(([key, value]) => {
      key = key.trim()
      value = value?.trim()

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
          // comment lines keep their text as it is
          const isComment = key.startsWith('#') || value === undefined
          output.push([key, isComment ? value : parseValue(value)])
        }
      }
    })

  return Promise.all(output)
}
