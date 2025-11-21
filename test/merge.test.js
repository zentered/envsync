import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

test('merge behavior: preserves existing keys not in .env.example', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    // Create .env.example with GCP_PROJECT and one variable
    await fs.writeFile(
      examplePath,
      `GCP_PROJECT=test-project
NEW_KEY=new-value
`
    )

    // Create existing .env with different keys
    await fs.writeFile(
      envPath,
      `GCP_PROJECT=test-project
OLD_KEY=old-value
PRESERVED_KEY=should-remain
`
    )

    // Run envsync
    await execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
      cwd: tmpDir
    })

    // Read result
    const result = await fs.readFile(envPath, 'utf8')
    const lines = result.split('\n')

    // Should have NEW_KEY from example
    assert.ok(lines.some((line) => line.includes('NEW_KEY=new-value')))

    // Should preserve OLD_KEY and PRESERVED_KEY
    assert.ok(lines.some((line) => line.includes('OLD_KEY=old-value')))
    assert.ok(lines.some((line) => line.includes('PRESERVED_KEY=should-remain')))
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('merge behavior: updates existing keys from .env.example', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    // Create .env.example
    await fs.writeFile(
      examplePath,
      `GCP_PROJECT=test-project
SHARED_KEY=updated-value
`
    )

    // Create existing .env with old value
    await fs.writeFile(
      envPath,
      `GCP_PROJECT=test-project
SHARED_KEY=old-value
OTHER_KEY=preserved
`
    )

    // Run envsync
    await execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
      cwd: tmpDir
    })

    // Read result
    const result = await fs.readFile(envPath, 'utf8')
    const lines = result.split('\n')

    // SHARED_KEY should be updated to new value
    assert.ok(lines.some((line) => line === 'SHARED_KEY=updated-value'))
    assert.ok(!lines.some((line) => line === 'SHARED_KEY=old-value'))

    // OTHER_KEY should be preserved
    assert.ok(lines.some((line) => line.includes('OTHER_KEY=preserved')))
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('merge behavior: creates new .env if it does not exist', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    // Create .env.example
    await fs.writeFile(
      examplePath,
      `GCP_PROJECT=test-project
NEW_KEY=new-value
`
    )

    // Do not create .env - it should be created fresh

    // Run envsync
    await execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
      cwd: tmpDir
    })

    // Read result
    const result = await fs.readFile(envPath, 'utf8')
    const lines = result.split('\n')

    // Should have keys from example
    assert.ok(lines.some((line) => line.includes('GCP_PROJECT=test-project')))
    assert.ok(lines.some((line) => line.includes('NEW_KEY=new-value')))
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})
