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

const STALE_TMP_MS = 10 * 60 * 1000

// Remove temp files that a crashed run left next to the output. Only files
// older than STALE_TMP_MS are removed, because a newer one can belong to a run
// that is still writing. Best effort: a failure here must not stop the sync,
// and one bad entry must not stop the removal of the others.
async function removeStaleTmpFiles(output) {
  const dir = path.dirname(output)
  const prefix = `${path.basename(output)}.envsync-`
  let names
  try {
    names = await fs.readdir(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (
      !name.startsWith(prefix) ||
      !/^[0-9a-f]{12}\.tmp$/.test(name.slice(prefix.length))
    ) {
      continue
    }
    try {
      const file = path.join(dir, name)
      // lstat: a symlink is judged by its own mtime, even when it dangles
      const { mtimeMs } = await fs.lstat(file)
      if (Date.now() - mtimeMs > STALE_TMP_MS) {
        await fs.rm(file, { force: true })
      }
    } catch {
      // skip this entry
    }
  }
}

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
  // Node ignores an `export ` prefix, so match keys without it
  const bareKey = (key) => key.replace(/^export\s+/, '')
  env.forEach(([key, value]) => {
    if (key !== '') {
      existingEnv.set(bareKey(key), value)
    }
  })

  // Convert Map back to array format, maintaining order: example keys come first
  const mergedEnv = env.map(([key]) => {
    if (key === '') return ['']
    return [key, existingEnv.get(bareKey(key))]
  })

  // Add any remaining keys from existing .env that weren't in .env.example
  // Use Set for O(n) performance instead of O(n²)
  const exampleKeys = new Set(
    env.map(([key]) => bareKey(key)).filter((key) => key !== '')
  )
  for (const [key, value] of existingEnv.entries()) {
    if (!exampleKeys.has(key)) {
      mergedEnv.push([key, value])
    }
  }

  let contents
  try {
    contents = joinEnv(mergedEnv)
  } catch (err) {
    // a value that cannot be written safely: leave the existing file alone
    console.error(err.message)
    process.exitCode = 1
    return
  }

  // Write to a private temp file in the same directory, then rename it over
  // the output. The secrets are never in a file with looser permissions, and a
  // symlinked output is replaced instead of followed.
  // The temp name is recognizable so a leftover from a crashed run (it holds all
  // secrets and a `.env` ignore rule does not match it) is removed on the next run.
  await removeStaleTmpFiles(output)

  const tmpOutput = `${output}.envsync-${randomBytes(6).toString('hex')}.tmp`
  try {
    await fs.writeFile(tmpOutput, contents, {
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
