'use strict'

import { readEnv } from './readEnv.js'

// Characters that are inert in a shell and need no quotes in Node.
const SAFE_BARE = /^[A-Za-z0-9_@%+=:,./-]*$/

/**
 * Format a value so that Node (`--env-file`, util.parseEnv) reads it back
 * unchanged and a shell that sources the file does not run or expand it.
 * The first of these forms that Node reads back exactly is used:
 * - bare, only when every character is in SAFE_BARE
 * - single quotes (the shell does not expand anything inside them)
 * - double quotes, only for a value with a `'` and none of `"`, `\`, `$` or a
 *   backtick, so the double-quoted form is inert in a shell too
 *
 * A value is refused, with an error naming the key, when no form fits:
 * - it contains a CR (Node drops it), or
 * - it contains a `'` together with `"`, `\`, `$` or a backtick. Single quotes
 *   cannot hold the `'`. Double quotes, bare or backtick quotes would let a
 *   shell expand or run part of the value, or Node would read it differently.
 * Nothing corrupted or unsafe is written.
 * joinEnv() also parses the whole output once and throws on any mismatch.
 */
function formatValue(key, value) {
  const candidates = [
    ...(SAFE_BARE.test(value) ? [value] : []),
    `'${value}'`,
    ...(value.includes("'") && !/["\\$`]/.test(value) ? [`"${value}"`] : [])
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
  if (value.includes("'")) {
    return (
      'it contains a single quote together with a double quote, a backslash, $ or ' +
      'a backtick. Single quotes cannot hold the single quote, and no other quoting ' +
      'is read back exactly by Node and safe when a shell sources the file.'
    )
  }
  return 'no .env quoting style reads it back unchanged.'
}

export function joinEnv(env) {
  const lines = env.map(([key, value]) => {
    if (key === '') return undefined
    // comment lines are passed through as they are, with no checks
    if (key.trimStart().startsWith('#')) return `${key}=${value}`
    return `${key}=${formatValue(key, String(value))}`
  })
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
