#!/usr/bin/env node

'use strict'

import fs from 'fs/promises'
import { readExample } from './lib/readExample.js'
import { readEnv } from './lib/readEnv.js'
import { joinEnv } from './lib/joinEnv.js'

const args = process.argv.slice(2);
const filePath = args[0] || '.env.example'

const exampleFile = await fs.readFile(filePath, 'utf8')
const env = await readExample(exampleFile)
const output = filePath.replace(".example", "")

// Check if .env file already exists
let existingEnv = new Map()
try {
  const existingFile = await fs.readFile(output, 'utf8')
  existingEnv = readEnv(existingFile)
} catch (err) {
  // File doesn't exist, that's okay
}

// Merge: update existing keys with new values, preserve keys not in example
const envArray = env.map(([key, value]) => {
  if (key !== '') {
    existingEnv.set(key, value)
  }
  return [key, value]
})

// Convert Map back to array format, maintaining order: example keys come first
const mergedEnv = env.map(([key]) => {
  if (key === '') return ['']
  return [key, existingEnv.get(key)]
})

// Add any remaining keys from existing .env that weren't in .env.example
for (const [key, value] of existingEnv.entries()) {
  const existsInExample = env.some(([k]) => k === key)
  if (!existsInExample) {
    mergedEnv.push([key, value])
  }
}

await fs.writeFile(output, joinEnv(mergedEnv))
