'use strict'

import { readEnv } from './readEnv.js'

/**
 * Format a value so that Node (`--env-file`, util.parseEnv) reads it back
 * unchanged. A plain value is written as is. Otherwise the first of these
 * forms that reads back exactly is used:
 * - double quotes with newlines written as `\n`
 * - single quotes
 * - double quotes with raw newlines
 *
 * Node does not unescape `\"` or `\\`, and it drops CR characters. A value
 * that needs a quote it cannot escape, such as one containing both `'` and `"`
 * together with a `#` or a newline, or one containing CR, has no form that
 * reads back. Those throw instead of writing a corrupted value.
 */
function formatValue(key, value) {
  const candidates = [
    value,
    `"${value.replace(/\n/g, '\\n')}"`,
    `'${value}'`,
    `"${value}"`
  ]
  const form = candidates.find((candidate) => {
    const parsed = readEnv(`K=${candidate}`)
    return parsed.size === 1 && parsed.get('K') === value
  })
  if (form === undefined) {
    throw new Error(
      `Cannot write ${key}: no .env quoting style reads this value back unchanged`
    )
  }
  return form
}

export function joinEnv(env) {
  return env
    .map(([key, value]) => {
      if (key !== '') {
        return `${key}=${formatValue(key, String(value))}`
      }
    })
    .join('\n')
}
