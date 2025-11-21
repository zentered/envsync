'use strict'

/**
 * Parse an existing .env file into key-value pairs
 * @param {string} envFile - Content of the .env file
 * @returns {Map<string, string>} Map of environment variables
 */
export function readEnv(envFile) {
  const envMap = new Map()

  envFile
    .split('\n')
    .map((line) => line.split(/=(.*)/s))
    .forEach(([key, value]) => {
      key = key?.trim() || ''
      value = value?.trim() || ''

      if (key !== '') {
        envMap.set(key, value)
      }
    })

  return envMap
}
