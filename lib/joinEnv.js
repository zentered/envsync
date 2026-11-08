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
 * joinEnv() also parses the whole output once and throws on any mismatch.
 */
function formatValue(key, value) {
  // A bare value that starts with a quote makes Node look for a closing quote
  // on later lines, so it is never written bare.
  const candidates = [
    ...(/^\s*["'`]/.test(value) ? [] : [value]),
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
  const lines = env.map(([key, value]) =>
    key === '' ? undefined : `${key}=${formatValue(key, String(value))}`
  )
  const output = lines.join('\n')

  // Safety net: each value was checked alone, so check the whole file once.
  // Entries whose key Node does not parse (such as comment lines) are skipped.
  const parsed = readEnv(output)
  const expected = new Map(
    env
      .filter(([key]) => /^[\w.-]+$/.test(key))
      .map(([key, value]) => [key, String(value)])
  )
  for (const [key, value] of expected) {
    if (parsed.get(key) !== value) {
      throw new Error(
        `Cannot write ${key}: the .env file does not read back unchanged`
      )
    }
  }

  return output
}
