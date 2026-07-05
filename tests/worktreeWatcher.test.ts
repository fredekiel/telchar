import { describe, expect, it } from 'vitest'
import { noteEvent } from '../src/main/worktreeWatcher'

const ROOT = '/proj'

describe('noteEvent', () => {
  it('maps a file event to its parent directory (absolute)', () => {
    const pending = noteEvent(new Set(), ROOT, 'src/renderer/App.tsx')
    expect([...pending!]).toEqual(['/proj/src/renderer'])
  })

  it('maps a root-level file to the root itself', () => {
    const pending = noteEvent(new Set(), ROOT, 'package.json')
    expect([...pending!]).toEqual(['/proj'])
  })

  it('dedupes events in the same directory', () => {
    let pending = noteEvent(new Set<string>(), ROOT, 'src/a.ts')
    pending = noteEvent(pending, ROOT, 'src/b.ts')
    expect(pending!.size).toBe(1)
  })

  it('ignores .git, node_modules and build output paths', () => {
    const pending = new Set<string>()
    for (const f of [
      '.git/index',
      '.git/objects/ab/cdef',
      'node_modules/react/index.js',
      'packages/app/node_modules/x/y.js',
      'dist/main.js',
      'release/app.dmg',
      '.idea/workspace.xml'
    ]) {
      expect(noteEvent(pending, ROOT, f)).toBe(pending)
      expect(pending.size).toBe(0)
    }
  })

  it('does not ignore files merely named like ignored dirs', () => {
    const pending = noteEvent(new Set(), ROOT, 'src/distances.ts')
    expect([...pending!]).toEqual(['/proj/src'])
  })

  it('returns null (refetch all) on a null/Buffer filename', () => {
    expect(noteEvent(new Set(), ROOT, null)).toBeNull()
    expect(noteEvent(new Set(), ROOT, Buffer.from('x'))).toBeNull()
  })

  it('stays null once overflowed', () => {
    expect(noteEvent(null, ROOT, 'src/a.ts')).toBeNull()
  })

  it('overflows to null past the dir cap', () => {
    let pending: Set<string> | null = new Set<string>()
    for (let i = 0; i < 60 && pending; i++) pending = noteEvent(pending, ROOT, `dir${i}/f.ts`)
    expect(pending).toBeNull()
  })
})
