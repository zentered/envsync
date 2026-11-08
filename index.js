#!/usr/bin/env node

'use strict'

import fs from 'fs/promises'
import { randomBytes } from 'crypto'
import path from 'path'
import { readExample } from './lib/readExample.js'
import { readEnv } from './lib/readEnv.js'
import { joinEnv } from './lib/joinEnv.js'

const args = process.argv.slice(2)
const filePath = args[0] || '.env.example'

const exampleFile = await fs.readFile(filePath, 'utf8')
const env = await readExample(exampleFile)
const output = filePath.replace('.example', '')

async function main() {
  // Check if .env file already exists
  let existingEnv = new Map()
  try {
    const existingFile = await fs.readFile(output, 'utf8')
    existingEnv = readEnv(existingFile)
  } catch (err) {
    // File doesn't exist, that's okay - we'll create a new one
    if (err.code !== 'ENOENT') {
      // Unexpected error (permissions, etc.). Writing would drop every key we
      // could not read, so abort and leave the file as it is.
      console.error(`Could not read existing ${output}: ${err.message}`)
      process.exitCode = 1
      return
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
  const exampleKeys = new Set(
    env.map(([key]) => key).filter((key) => key !== '')
  )
  for (const [key, value] of existingEnv.entries()) {
    if (!exampleKeys.has(key)) {
      mergedEnv.push([key, value])
    }
  }

  // Write to a private temp file in the same directory, then rename it over
  // the output. The secrets are never in a file with looser permissions, and a
  // symlinked output is replaced instead of followed.
  // The temp name is recognizable so a leftover from a crashed run (it holds all
  // secrets and a `.env` ignore rule does not match it) is removed on the next run.
  const outputDir = path.dirname(output)
  const tmpPrefix = `${path.basename(output)}.envsync-`
  const isStaleTmp = (name) =>
    name.startsWith(tmpPrefix) &&
    /^[0-9a-f]{12}\.tmp$/.test(name.slice(tmpPrefix.length))
  for (const name of await fs.readdir(outputDir)) {
    if (isStaleTmp(name)) {
      await fs.rm(path.join(outputDir, name), { force: true })
    }
  }

  const tmpOutput = `${output}.envsync-${randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmpOutput, joinEnv(mergedEnv), {
      flag: 'wx',
      mode: 0o600
    })
    await fs.rename(tmpOutput, output)
  } catch (err) {
    try {
      await fs.rm(tmpOutput, { force: true })
    } catch {
      // keep the original error
    }
    console.error(`Could not write ${output}: ${err.message}`)
    process.exitCode = 1
  }
}

await main()
