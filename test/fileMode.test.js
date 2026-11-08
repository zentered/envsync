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
const example = `GCP_PROJECT=test-project
NEW_KEY=new-value
`

async function run(tmpDir, examplePath) {
  await execFileAsync('node', [path.join(rootDir, 'index.js'), examplePath], {
    cwd: tmpDir
  })
}

test('file mode: new .env is written with mode 0600', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    await fs.writeFile(examplePath, example)
    await run(tmpDir, examplePath)

    const stat = await fs.stat(envPath)
    assert.equal(stat.mode & 0o777, 0o600)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('file mode: existing 0644 .env is changed to 0600', async () => {
  const tmpDir = await fs.mkdtemp(path.join(__dirname, 'tmp-'))
  const examplePath = path.join(tmpDir, '.env.example')
  const envPath = path.join(tmpDir, '.env')

  try {
    await fs.writeFile(examplePath, example)
    await fs.writeFile(envPath, 'OLD_KEY=old-value\n')
    await fs.chmod(envPath, 0o644)
    assert.equal((await fs.stat(envPath)).mode & 0o777, 0o644)

    await run(tmpDir, examplePath)

    const stat = await fs.stat(envPath)
    assert.equal(stat.mode & 0o777, 0o600)
    assert.match(await fs.readFile(envPath, 'utf8'), /NEW_KEY=new-value/)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})
