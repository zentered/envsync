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
 * A value with `$` or a backtick is only ever single-quoted. Bare or in double
 * quotes, a shell that sources the file would expand it (`$(cmd)`).
 *
 * Node does not unescape `\"` or `\\`, and it drops CR characters. So a value is
 * refused, with an error naming the key, when
 * - it contains a CR, or
 * - it contains a `'` together with `$` or a backtick (single quotes cannot
 *   hold the `'`, and no other form is shell safe), or
 * - it needs quotes and contains a `'` together with a `"` or a literal
 *   backslash-n. Only backtick quotes would carry it, and those are not used
 *   because they allow command substitution when the file is sourced.
 * Nothing corrupted is written.
 * joinEnv() also parses the whole output once and throws on any mismatch.
 */
function formatValue(key, value) {
  const single = `'${value}'`
  const candidates = /[$`]/.test(value)
    ? [single]
    : [
        // A bare value that starts with a quote makes Node look for a closing
        // quote on later lines, so it is never written bare.
        ...(/^\s*["'`]/.test(value) ? [] : [value]),
        `"${value.replace(/\n/g, '\\n')}"`,
        single,
        `"${value}"`
      ]
  const form = candidates.find((candidate) => {
    const parsed = readEnv(`K=${candidate}`)
    return parsed.size === 1 && parsed.get('K') === value
  })
  if (form === undefined) {
    throw new Error(`Cannot write ${key}: ${refusalReason(value)}`)
  }
  return form
}

function refusalReason(value) {
  if (value.includes('\r')) {
    return 'it contains a carriage return, which Node drops.'
  }
  if (value.includes("'") && /[$`]/.test(value)) {
    return (
      'it contains a single quote together with $ or a backtick. It can only be ' +
      'single-quoted, and bare or double quotes would let a shell expand it when ' +
      'the file is sourced.'
    )
  }
  if (value.includes("'")) {
    return (
      'it contains a single quote together with a double quote or a literal backslash-n, ' +
      'so only backtick quotes would work. Backtick quotes are not used because ' +
      'they allow command substitution when the file is sourced.'
    )
  }
  return 'no .env quoting style reads it back unchanged.'
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
