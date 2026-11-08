'use strict'

// A value needs quoting if the parsers behind `node --env-file` and dotenv
// would change it: newlines, `#` (starts a comment), quotes, backslashes and
// leading or trailing whitespace.
const NEEDS_QUOTES = /[\n\r"'`\\#]|^\s|\s$/

/**
 * Format a value for a .env file that Node (`--env-file`, util.parseEnv) and
 * dotenv can read back unchanged.
 *
 * Those parsers unescape only `\n` in double quotes. They do not unescape `\"`
 * or `\\`. So the quote style depends on the content:
 * - plain value: no quotes
 * - no `"`, `\` or CR: double quotes, newlines written as `\n`
 * - otherwise, a quote character the value does not contain: single quotes,
 *   then backticks, raw content
 * - contains all of them: double quotes with `\"`, `\\` and `\n` escapes.
 *   readEnv() reads this back, but Node and dotenv do not unescape it.
 */
export function formatValue(value) {
  value = String(value)
  if (!NEEDS_QUOTES.test(value)) return value

  if (!/["\\\r]/.test(value)) {
    return `"${value.replace(/\n/g, '\\n')}"`
  }
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('`')) return `\`${value}\``

  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
  return `"${escaped}"`
}

export function joinEnv(env) {
  return env
    .map(([key, value]) => {
      if (key !== '') {
        return `${key}=${formatValue(value)}`
      }
    })
    .join('\n')
}
