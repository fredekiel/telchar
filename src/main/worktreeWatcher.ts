// Recursive worktree watcher for the Files sidebar view (VSCode-style change
// detection: catches edits from ptys, Claude Code, external editors alike).
// macOS-only app, so fs.watch{recursive} rides FSEvents — one kernel stream
// per root, no initial tree scan. Lifecycle is renderer-scoped: the Files view
// watches on mount and unwatches on unmount, so at most one project (the
// selected one) is watched at a time — that's the perf budget.

import { watch, type FSWatcher } from 'fs'
import { dirname, join } from 'path'

const DEBOUNCE_MS = 300
const MAX_DIRS = 50 // above this, dirs = null → renderer refetches everything open

const IGNORED = /(^|\/)(\.git|node_modules|dist|release|out|build|\.idea|\.vscode)(\/|$)/

type WorktreeSink = (projectId: string, dirs: string[] | null) => void

interface Entry {
  root: string
  watcher: FSWatcher
  pending: Set<string> | null // absolute dirs; null = overflow
  debounce: NodeJS.Timeout | null
}

// Fold one raw fs.watch event into the pending dir set (pure, unit-tested).
// Returns the new pending value; unchanged reference means the event was ignored.
export function noteEvent(
  pending: Set<string> | null,
  root: string,
  filename: string | Buffer | null
): Set<string> | null {
  if (pending === null) return null
  if (typeof filename !== 'string') return null // unknown target — refetch all
  if (IGNORED.test(filename)) return pending
  if (pending.size >= MAX_DIRS) return null
  pending.add(join(root, dirname(filename)))
  return pending
}

export class WorktreeWatcher {
  private entries = new Map<string, Entry>()
  private sink: WorktreeSink = () => {}

  setSink(sink: WorktreeSink): void {
    this.sink = sink
  }

  watch(projectId: string, root: string): void {
    if (this.entries.get(projectId)?.root === root) return
    this.unwatch(projectId)
    let watcher: FSWatcher
    try {
      watcher = watch(root, { recursive: true })
    } catch {
      return // root vanished or unwatchable — Files view will show readDir errors anyway
    }
    const entry: Entry = { root, watcher, pending: new Set(), debounce: null }
    watcher.on('change', (_event, filename) => {
      const before = entry.pending?.size ?? -1
      entry.pending = noteEvent(entry.pending, root, filename)
      const after = entry.pending?.size ?? -1
      if (after === before && entry.pending !== null) return // ignored or duplicate dir
      this.schedule(projectId, entry)
    })
    watcher.on('error', () => this.unwatch(projectId))
    this.entries.set(projectId, entry)
  }

  unwatch(projectId: string): void {
    const entry = this.entries.get(projectId)
    if (!entry) return
    if (entry.debounce) clearTimeout(entry.debounce)
    entry.watcher.close()
    this.entries.delete(projectId)
  }

  closeAll(): void {
    for (const id of [...this.entries.keys()]) this.unwatch(id)
  }

  private schedule(projectId: string, entry: Entry): void {
    if (entry.debounce) clearTimeout(entry.debounce)
    entry.debounce = setTimeout(() => {
      entry.debounce = null
      const dirs = entry.pending ? [...entry.pending] : null
      entry.pending = new Set()
      if (dirs === null || dirs.length > 0) this.sink(projectId, dirs)
    }, DEBOUNCE_MS)
  }
}

export const worktreeWatcher = new WorktreeWatcher()
