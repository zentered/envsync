'use strict'

const QUOTES = ['"', "'", '`']

/**
 * Find the closing quote of a value, starting after the opening quote.
 * Double quotes honor backslash escapes. Single quotes and backticks are raw.
 * @returns {number} index of the closing quote, or -1
 */
function findClosingQuote(text, quote, from) {
  for (let i = from; i < text.length; i++) {
    if (quote === '"' && text[i] === '\\') {
      i++
    } else if (text[i] === quote) {
      return i
    }
  }
  return -1
}

/**
 * Parse the raw text after `KEY=` for a single line.
 * A fully quoted value is unquoted. Anything else is returned trimmed.
 * @param {string} raw - Raw value, may include quotes
 * @returns {string}
 */
export function parseValue(raw) {
  const value = raw.trim()
  const quote = value[0]
  if (QUOTES.includes(quote)) {
    const end = findClosingQuote(value, quote, 1)
    if (end === value.length - 1) {
      return unquote(value.slice(1, end), quote)
    }
  }
  return value
}

function unquote(inner, quote) {
  if (quote !== '"') return inner
  return inner.replace(/\\(["\\n])/g, (_, c) => (c === 'n' ? '\n' : c))
}

/**
 * Parse an existing .env file into key-value pairs
 * Quoted values may span several lines. Double-quoted values unescape
 * \n, \" and \\.
 * @param {string} envFile - Content of the .env file
 * @returns {Map<string, string>} Map of environment variables
 */
export function readEnv(envFile) {
  const envMap = new Map()
  const lines = envFile.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const [rawKey, rawValue] = lines[i].split(/=(.*)/s)
    const key = rawKey?.trim() || ''
    if (key === '') continue

    let value
    const text = rawValue?.trimStart() || ''
    const quote = text[0]
    if (QUOTES.includes(quote)) {
      // look for the closing quote on this line, then on the following lines
      let joined = text
      let end = findClosingQuote(joined, quote, 1)
      let last = i
      while (end === -1 && last + 1 < lines.length) {
        last++
        joined += '\n' + lines[last]
        end = findClosingQuote(joined, quote, 1)
      }
      if (end !== -1) {
        value = unquote(joined.slice(1, end), quote)
        i = last
      }
    }
    // unquoted or unclosed quote: keep the old single-line behavior
    envMap.set(key, value ?? rawValue?.trim() ?? '')
  }

  return envMap
}
