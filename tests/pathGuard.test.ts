import { describe, expect, it, beforeAll } from 'vitest'
import { promises as fs, mkdtempSync, realpathSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { addRoot, isAllowedNewPath, isAllowedPath } from '../src/main/pathGuard'

// realpathSync so the stored root matches what isAllowed*'s realpath returns
// (macOS tmp is a /var -> /private/var symlink).
let root: string

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'telchar-pg-')))
  addRoot(root)
  await fs.mkdir(join(root, 'sub'), { recursive: true })
})

describe('isAllowedNewPath', () => {
  it('accepts a not-yet-existing path directly under an allowed root', async () => {
    expect(await isAllowedNewPath(join(root, 'newfile.txt'))).toBe(true)
  })

  it('accepts a not-yet-existing path under an existing subdir of a root', async () => {
    expect(await isAllowedNewPath(join(root, 'sub', 'x.ts'))).toBe(true)
  })

  it('rejects when the parent directory does not exist', async () => {
    expect(await isAllowedNewPath(join(root, 'no-such-dir', 'x.ts'))).toBe(false)
  })

  it('rejects a target whose parent escapes every root', async () => {
    // root/../escape resolves to root's parent (tmpdir) which is not a root.
    expect(await isAllowedNewPath(join(root, '..', 'escape.txt'))).toBe(false)
  })

  it('rejects a path entirely outside any allowed root', async () => {
    expect(await isAllowedNewPath(join(tmpdir(), 'telchar-not-a-root.txt'))).toBe(false)
  })
})

describe('isAllowedPath', () => {
  it('accepts an existing allowed root', async () => {
    expect(await isAllowedPath(root)).toBe(true)
  })

  it('rejects a path that does not exist (realpath throws)', async () => {
    expect(await isAllowedPath(join(root, 'ghost.txt'))).toBe(false)
  })
})
