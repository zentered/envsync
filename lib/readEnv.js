'use strict'

// util.parseEnv is the parser behind `node --env-file`. Using it keeps quotes,
// comments, backslashes and multi-line values identical to what Node reads.
// It exists since Node 21.7, but eslint-plugin-n marks it experimental below
// 22.21.
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { parseEnv } from 'node:util'

/**
 * Parse the raw text after `KEY=` the way Node reads it: quotes removed,
 * trailing comment dropped.
 * @param {string} raw - Raw value, may include quotes
 * @returns {string}
 */
export function parseValue(raw) {
  return parseEnv(`K=${raw}`).K ?? ''
}

/**
 * Parse an existing .env file into key-value pairs
 * Quoted values may span several lines. Parsing is done by Node's
 * util.parseEnv.
 * @param {string} envFile - Content of the .env file
 * @returns {Map<string, string>} Map of environment variables
 */
export function readEnv(envFile) {
  return new Map(Object.entries(parseEnv(envFile)))
}
