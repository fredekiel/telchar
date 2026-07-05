import { describe, expect, it } from 'vitest'
import { parsePorcelainV2 } from '../src/main/gitService'

const NUL = '\0'

describe('parsePorcelainV2', () => {
  it('parses branch headers + ahead/behind', () => {
    const raw = [
      '# branch.oid abc123',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -1'
    ].join(NUL)
    const out = parsePorcelainV2(raw)
    expect(out.branch).toBe('main')
    expect(out.upstream).toBe('origin/main')
    expect(out.ahead).toBe(2)
    expect(out.behind).toBe(1)
    expect(out.files).toEqual([])
  })

  it('parses ordinary, renamed, unmerged and untracked entries', () => {
    const raw = [
      '# branch.head main',
      '1 .M N... 100644 100644 100644 abc def src/app.ts',
      '1 A. N... 000000 100644 100644 000 111 new file.ts', // path with space
      '2 R. N... 100644 100644 100644 aaa bbb R100 new/name.ts',
      'old/name.ts', // rename origin follows as its own NUL token
      'u UU N... 100644 100644 100644 100644 a b c conflicted.ts',
      '? untracked.txt'
    ].join(NUL)
    const out = parsePorcelainV2(raw)
    expect(out.files).toEqual([
      { path: 'src/app.ts', index: '.', worktree: 'M' },
      { path: 'new file.ts', index: 'A', worktree: '.' },
      { path: 'new/name.ts', index: 'R', worktree: '.', renamedFrom: 'old/name.ts' },
      { path: 'conflicted.ts', index: 'U', worktree: 'U' },
      { path: 'untracked.txt', index: '?', worktree: '?' }
    ])
    expect(out.fileTotal).toBe(5)
  })

  it('handles detached HEAD and empty output', () => {
    expect(parsePorcelainV2('# branch.head (detached)').branch).toBe('(detached)')
    expect(parsePorcelainV2('')).toMatchObject({ files: [], fileTotal: 0 })
  })
})
