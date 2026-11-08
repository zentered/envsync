import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const indexPath = path.join(__dirname, '..', 'index.js')
const example = `GCP_PROJECT=test-project
NEW_KEY=new-value
`

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

test('file mode: new .env is written with mode 0600', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    await run(tmpDir, examplePath)

    assert.equal((await fs.stat(envPath)).mode & 0o777, 0o600)
  })
})

test('file mode: existing 0644 .env is replaced by a 0600 file', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    await fs.writeFile(envPath, 'OLD_KEY=old-value\n')
    await fs.chmod(envPath, 0o644)
    // A second name for the original inode. If the original file were
    // written in place, it would hold the new secrets while still 0644.
    const originalPath = path.join(tmpDir, 'original')
    await fs.link(envPath, originalPath)

    await run(tmpDir, examplePath)

    const original = await fs.stat(originalPath)
    assert.equal(original.mode & 0o777, 0o644)
    assert.equal(await fs.readFile(originalPath, 'utf8'), 'OLD_KEY=old-value\n')

    const env = await fs.stat(envPath)
    assert.equal(env.mode & 0o777, 0o600)
    assert.notEqual(env.ino, original.ino)
    const content = await fs.readFile(envPath, 'utf8')
    assert.match(content, /NEW_KEY=new-value/)
    assert.match(content, /OLD_KEY=old-value/)
  })
})

test('file mode: a symlinked .env is replaced, the target is untouched', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    const targetPath = path.join(tmpDir, 'target')
    await fs.writeFile(targetPath, 'TARGET_KEY=target-value\n')
    await fs.chmod(targetPath, 0o644)
    await fs.symlink(targetPath, envPath)

    await run(tmpDir, examplePath)

    assert.equal((await fs.lstat(envPath)).isSymbolicLink(), false)
    assert.equal((await fs.stat(envPath)).mode & 0o777, 0o600)
    assert.match(await fs.readFile(envPath, 'utf8'), /NEW_KEY=new-value/)
    assert.equal(
      await fs.readFile(targetPath, 'utf8'),
      'TARGET_KEY=target-value\n'
    )
    assert.equal((await fs.stat(targetPath)).mode & 0o777, 0o644)
  })
})

test('file mode: a write error prints a message, exits 1 and leaves no temp file', async () => {
  await withTmpDir(async ({ tmpDir, examplePath }) => {
    await fs.writeFile(examplePath, example)
    // creating the temp file in a read-only directory fails
    await fs.chmod(tmpDir, 0o500)

    try {
      await assert.rejects(run(tmpDir, examplePath), (err) => {
        assert.equal(err.code, 1)
        assert.match(err.stderr, /Could not write .*\.env: /)
        assert.doesNotMatch(err.stderr, /\n\s+at /)
        return true
      })
    } finally {
      await fs.chmod(tmpDir, 0o700)
    }

    assert.deepEqual((await fs.readdir(tmpDir)).sort(), ['.env.example'])
  })
})

test('file mode: stale temp files older than 10 minutes are removed, fresh ones kept', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    const stale = path.join(tmpDir, '.env.envsync-0123456789ab.tmp')
    // may belong to a run that is still writing
    const fresh = path.join(tmpDir, '.env.envsync-ba9876543210.tmp')
    // names that do not match the exact pattern must stay
    const keep = ['.env.envsync-0123456789ab.tmp.bak', '.env.backup', 'x.tmp']
    await fs.writeFile(stale, 'OLD_SECRET=leftover\n', { mode: 0o600 })
    await fs.writeFile(fresh, 'LIVE_SECRET=in-flight\n', { mode: 0o600 })
    for (const name of keep) await fs.writeFile(path.join(tmpDir, name), 'x')
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    await fs.utimes(stale, hourAgo, hourAgo)

    await run(tmpDir, examplePath)

    const files = (await fs.readdir(tmpDir)).sort()
    assert.deepEqual(
      files,
      ['.env', '.env.example', path.basename(fresh), ...keep].sort()
    )
    assert.match(await fs.readFile(envPath, 'utf8'), /NEW_KEY=new-value/)
  })
})

test('file mode: one bad sweep entry does not stop the removal of the others', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    // a dangling symlink with a matching name, next to old stale files on
    // both sides of it in name order
    const names = [
      '.env.envsync-000000000000.tmp',
      '.env.envsync-555500000000.tmp',
      '.env.envsync-aaaa00000000.tmp',
      '.env.envsync-ffff00000000.tmp'
    ]
    const link = path.join(tmpDir, names[1])
    await fs.symlink(path.join(tmpDir, 'missing'), link)
    await fs.lutimes(link, hourAgo, hourAgo)
    for (const name of [names[0], names[2], names[3]]) {
      const file = path.join(tmpDir, name)
      await fs.writeFile(file, 'OLD_SECRET=leftover\n', { mode: 0o600 })
      await fs.utimes(file, hourAgo, hourAgo)
    }

    await run(tmpDir, examplePath)

    assert.deepEqual((await fs.readdir(tmpDir)).sort(), [
      '.env',
      '.env.example'
    ])
    assert.match(await fs.readFile(envPath, 'utf8'), /NEW_KEY=new-value/)
  })
})

test('file mode: an unlistable output directory does not stop the write', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    // write and search, but no read: readdir fails, creating files works
    await fs.chmod(tmpDir, 0o300)

    try {
      await run(tmpDir, examplePath)
    } finally {
      await fs.chmod(tmpDir, 0o700)
    }

    assert.match(await fs.readFile(envPath, 'utf8'), /NEW_KEY=new-value/)
  })
})

test('file mode: a failing temp file cleanup does not hide the write error', async () => {
  await withTmpDir(async ({ tmpDir, examplePath }) => {
    await fs.writeFile(examplePath, example)
    await fs.chmod(tmpDir, 0o500)
    const failRm =
      "data:text/javascript,import fs from 'fs/promises';" +
      "fs.rm = async () => { throw new Error('rm failed') }"

    try {
      await assert.rejects(
        execFileAsync('node', ['--import', failRm, indexPath, examplePath], {
          cwd: tmpDir
        }),
        (err) => {
          assert.equal(err.code, 1)
          assert.match(err.stderr, /Could not write .*\.env: /)
          assert.doesNotMatch(err.stderr, /rm failed/)
          return true
        }
      )
    } finally {
      await fs.chmod(tmpDir, 0o700)
    }
  })
})

test('file mode: an unreadable existing .env aborts and is left untouched', async () => {
  await withTmpDir(async ({ tmpDir, examplePath, envPath }) => {
    await fs.writeFile(examplePath, example)
    const original = 'CUSTOM_KEY=custom-value\n'
    await fs.writeFile(envPath, original)
    // writable but unreadable: a run that ignores the read error would replace it
    await fs.chmod(envPath, 0o200)

    try {
      await assert.rejects(run(tmpDir, examplePath), (err) => {
        assert.equal(err.code, 1)
        assert.match(err.stderr, /Could not read existing .*\.env: /)
        assert.doesNotMatch(err.stderr, /\n\s+at /)
        return true
      })
    } finally {
      await fs.chmod(envPath, 0o644)
    }

    assert.equal(await fs.readFile(envPath, 'utf8'), original)
    assert.deepEqual((await fs.readdir(tmpDir)).sort(), [
      '.env',
      '.env.example'
    ])
  })
})
