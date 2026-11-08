#!/usr/bin/env node

'use strict'

import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import { readExample } from './lib/readExample.js'
import { readEnv } from './lib/readEnv.js'
import { joinEnv } from './lib/joinEnv.js'

const args = process.argv.slice(2)
const filePath = args[0] || '.env.example'

const exampleFile = await fs.readFile(filePath, 'utf8')
const env = await readExample(exampleFile)
const output = filePath.replace('.example', '')

// Check if .env file already exists
let existingEnv = new Map()
try {
  const existingFile = await fs.readFile(output, 'utf8')
  existingEnv = readEnv(existingFile)
} catch (err) {
  // File doesn't exist, that's okay - we'll create a new one
  if (err.code !== 'ENOENT') {
    // Unexpected error (permissions, corrupted file, etc.)
    console.error(`Warning: Could not read existing ${output}: ${err.message}`)
  }
}

// Merge: update existing keys with new values from .env.example
env.forEach(([key, value]) => {
  if (key !== '') {
    existingEnv.set(key, value)
  }
})

// Convert Map back to array format, maintaining order: example keys come first
const mergedEnv = env.map(([key]) => {
  if (key === '') return ['']
  return [key, existingEnv.get(key)]
})

// Add any remaining keys from existing .env that weren't in .env.example
// Use Set for O(n) performance instead of O(n²)
const exampleKeys = new Set(env.map(([key]) => key).filter((key) => key !== ''))
for (const [key, value] of existingEnv.entries()) {
  if (!exampleKeys.has(key)) {
    mergedEnv.push([key, value])
  }
}

// Write to a private temp file in the same directory, then rename it over
// the output. The secrets are never in a file with looser permissions, and a
// symlinked output is replaced instead of followed.
const tmpOutput = `${output}.${randomBytes(6).toString('hex')}`
try {
  await fs.writeFile(tmpOutput, joinEnv(mergedEnv), { flag: 'wx', mode: 0o600 })
  await fs.rename(tmpOutput, output)
} catch (err) {
  await fs.rm(tmpOutput, { force: true })
  console.error(`Could not write ${output}: ${err.message}`)
  process.exitCode = 1
}
