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

// Parse a .env string the way `node --env-file` does, in a child process.
async function parseWithNode(content) {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  try {
    const file = path.join(tmpDir, '.env')
    await fs.writeFile(file, content)
    const { stdout } = await execFileAsync(
      'node',
      [`--env-file=${file}`, '-p', 'JSON.stringify(process.env)'],
      { cwd: tmpDir }
    )
    return JSON.parse(stdout)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

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
    assert.ok(
      lines.some((line) => line.includes('PRESERVED_KEY=should-remain'))
    )
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

test('merge behavior: preserves values with spaces', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    // Create .env.example
    await fs.writeFile(
      examplePath,
      `GCP_PROJECT=test-project
MESSAGE=Hello World
`
    )

    // Create existing .env with value containing spaces
    await fs.writeFile(
      envPath,
      `GCP_PROJECT=test-project
DATABASE_URL=postgresql://user:my pass@localhost:5432/db
`
    )

    // Run envsync
    await execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
      cwd: tmpDir
    })

    // Read result
    const result = await fs.readFile(envPath, 'utf8')
    const lines = result.split('\n')

    // Should preserve spaces in both new and existing values
    assert.ok(lines.some((line) => line === "MESSAGE='Hello World'"))
    assert.ok(
      lines.some(
        (line) =>
          line === "DATABASE_URL='postgresql://user:my pass@localhost:5432/db'"
      )
    )
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('merge behavior: keeps multi-line and # values intact across runs', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')
  const pem =
    '-----BEGIN PRIVATE KEY-----\nabc=\ndef\n-----END PRIVATE KEY-----'

  try {
    await fs.writeFile(
      examplePath,
      `GCP_PROJECT=test-project
LITERAL="kept # as is"
`
    )

    // Existing .env written with the old format would have broken the PEM,
    // so write the new format: one escaped line.
    await fs.writeFile(
      envPath,
      `GCP_PROJECT=test-project
PEM="${pem.replace(/\n/g, '\\n')}"
HASHED="pass#word"
MULTI="line1

  line2"
AFTER=1
`
    )

    const run = () =>
      execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
        cwd: tmpDir
      })
    await run()
    const first = await fs.readFile(envPath, 'utf8')
    await run()
    const second = await fs.readFile(envPath, 'utf8')

    // stable across runs
    assert.equal(second, first)

    // node --env-file reads the values back unchanged
    const parsed = await parseWithNode(second)
    assert.equal(parsed.PEM, pem)
    assert.equal(parsed.HASHED, 'pass#word')
    assert.equal(parsed.MULTI, 'line1\n\n  line2')
    assert.equal(parsed.AFTER, '1')
    assert.equal(parsed.LITERAL, 'kept # as is')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})
