import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { readEnv } from '../lib/readEnv.js'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join(__dirname, '..', 'index.js')

async function withTmpDir(fn) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'envsync-'))
  try {
    await fn({
      tmpDir,
      examplePath: path.join(tmpDir, '.env.example'),
      envPath: path.join(tmpDir, '.env')
    })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

const run = (tmpDir, examplePath) =>
  execFileAsync('node', [indexPath, examplePath], { cwd: tmpDir })

test('export prefix: the example value replaces the old value', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, 'GCP_PROJECT=p\nexport API_KEY=new\n')
    await fs.writeFile(envPath, 'export API_KEY=old\nCUSTOM=1\n')

    await run(tmpDir, examplePath)

    const env = readEnv(await fs.readFile(envPath, 'utf8'))
    assert.equal(env.get('API_KEY'), 'new')
    assert.equal(env.get('CUSTOM'), '1')
    const lines = (await fs.readFile(envPath, 'utf8')).split('\n')
    assert.equal(lines.filter((line) => /API_KEY/.test(line)).length, 1)
  })
})

test('refused value: prints the key, exits 1 and leaves .env untouched', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    // a backtick value can hold both quote characters, but cannot be written
    await fs.writeFile(examplePath, 'GCP_PROJECT=p\nBAD=`it\'s "both" # x`\n')
    const original = 'CUSTOM=1\n'
    await fs.writeFile(envPath, original)

    await assert.rejects(run(tmpDir, examplePath), (err) => {
      assert.equal(err.code, 1)
      assert.match(err.stderr, /Cannot write BAD/)
      assert.doesNotMatch(err.stderr, /both/)
      assert.doesNotMatch(err.stderr, /\n\s+at /)
      return true
    })

    assert.equal(await fs.readFile(envPath, 'utf8'), original)
    assert.deepEqual((await fs.readdir(tmpDir)).sort(), [
      '.env',
      '.env.example'
    ])
  })
})
