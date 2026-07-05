// VSCode's git decoration semantics — letters + the exact default dark-theme
// hexes from the built-in git extension's package.json color contributions.

import type { GitFileEntry } from '@shared/ipc'

export const GIT_COLORS = {
  added: '#81b88b',
  modified: '#E2C08D',
  deleted: '#c74e39',
  untracked: '#73C991',
  renamed: '#73C991',
  conflicting: '#e4676b',
  ignored: '#8C8C8C'
} as const

export interface GitDecoration {
  letter: string
  color: string
  label: string
}

// Effective single letter: worktree change wins over staged (matches how
// VSCode badges the file tree), untracked '?' -> 'U', conflicts -> '!'.
export function decorate(entry: GitFileEntry): GitDecoration {
  if (entry.index === 'U' || entry.worktree === 'U') {
    return { letter: '!', color: GIT_COLORS.conflicting, label: 'Conflict' }
  }
  if (entry.index === '?' || entry.worktree === '?') {
    return { letter: 'U', color: GIT_COLORS.untracked, label: 'Untracked' }
  }
  const ch = entry.worktree !== '.' && entry.worktree !== ' ' ? entry.worktree : entry.index
  switch (ch) {
    case 'A':
      return { letter: 'A', color: GIT_COLORS.added, label: 'Added' }
    case 'D':
      return { letter: 'D', color: GIT_COLORS.deleted, label: 'Deleted' }
    case 'R':
      return { letter: 'R', color: GIT_COLORS.renamed, label: 'Renamed' }
    case 'C':
      return { letter: 'C', color: GIT_COLORS.renamed, label: 'Copied' }
    default:
      return { letter: 'M', color: GIT_COLORS.modified, label: 'Modified' }
  }
}
