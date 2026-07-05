// Markdown / plan file watching for the plan viewer (Phase A).
// Path-based (no provider abstraction) — Claude plans are just files under
// ~/.claude/plans. Paths are containment-checked by the IPC layer before use.

import chokidar, { type FSWatcher } from 'chokidar'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join, basename } from 'path'
import type { PlanEntry } from '@shared/ipc'
import { resolveShellEnv } from './env'

type ChangeSink = (path: string, content: string) => void

export class MarkdownWatcher {
  private watchers = new Map<string, FSWatcher>()
  private sink: ChangeSink = () => {}

  setSink(sink: ChangeSink): void {
    this.sink = sink
  }

  async watch(path: string): Promise<string> {
    if (!this.watchers.has(path)) {
      const w = chokidar.watch(path, { ignoreInitial: true })
      w.on('change', () => this.emit(path))
      w.on('add', () => this.emit(path))
      this.watchers.set(path, w)
    }
    return this.read(path)
  }

  unwatch(path: string): void {
    const w = this.watchers.get(path)
    if (w) {
      void w.close()
      this.watchers.delete(path)
    }
  }

  closeAll(): void {
    for (const w of this.watchers.values()) void w.close()
    this.watchers.clear()
  }

  private async emit(path: string): Promise<void> {
    this.sink(path, await this.read(path))
  }

  private async read(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf8')
    } catch {
      return ''
    }
  }
}

export const markdownWatcher = new MarkdownWatcher()

// Watches the ~/.claude/plans DIRECTORY (not individual files) so plans
// auto-surface even when the Claude hooks are NOT installed — hook timing for
// plan-mode presentation is undocumented/unreliable, but the plan .md always
// lands on disk here. One chokidar watcher on a single dir, debounced. Emits
// the changed plan path; the renderer attributes it to the owning claude tab.
export class PlansDirWatcher {
  private watcher: FSWatcher | null = null
  private sink: (path: string) => void = () => {}
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastPath = ''

  setSink(sink: (path: string) => void): void {
    this.sink = sink
  }

  start(): void {
    if (this.watcher) return
    const dir = join(homedir(), '.claude', 'plans')
    // ignoreInitial: never fire for the plans already on disk at boot.
    // depth: 0: plans are flat files, no need to descend.
    const w = chokidar.watch(dir, { ignoreInitial: true, depth: 0 })
    const onEvent = (path: string): void => {
      if (!path.endsWith('.md')) return
      this.lastPath = path
      // Debounce: the transcript's planFilePath entry and the .md write land
      // close together but not atomically — wait so the renderer's re-resolve
      // scan sees the new planFilePath, and coalesce rapid multi-writes.
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.sink(this.lastPath), 400)
    }
    w.on('add', onEvent)
    w.on('change', onEvent)
    this.watcher = w
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer)
    void this.watcher?.close()
    this.watcher = null
  }
}

export const plansDirWatcher = new PlansDirWatcher()

// Auto-surface Claude Code plans, newest first.
export async function listClaudePlans(): Promise<PlanEntry[]> {
  const dir = join(homedir(), '.claude', 'plans')
  try {
    const names = await fs.readdir(dir)
    const entries = await Promise.all(
      names
        .filter((n) => n.endsWith('.md'))
        .map(async (n) => {
          const path = join(dir, n)
          const stat = await fs.stat(path)
          return { path, title: titleFromPlan(n), mtimeMs: stat.mtimeMs }
        })
    )
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  } catch {
    return []
  }
}

function titleFromPlan(filename: string): string {
  return basename(filename, '.md').replace(/-/g, ' ')
}

// ---- plan ↔ project association (heuristic) ----
// Plan files carry no project metadata, but Claude Code's per-project session
// transcripts (~/.claude/projects/<encoded-cwd>/*.jsonl) mention every plan
// they created or read. Grepping those yields the plan basenames a project's
// sessions touched. Heuristic: a plan can be referenced from several projects,
// and plans from wiped transcript dirs match nothing.

const planRefCache = new Map<string, { at: number; refs: string[] }>()
const PLAN_REF_TTL_MS = 30_000
const PLAN_REF_MAX_OUTPUT = 5_000_000 // grep -o output cap; matches are tiny lines

export async function plansForProject(projectPath: string): Promise<string[]> {
  const cached = planRefCache.get(projectPath)
  if (cached && Date.now() - cached.at < PLAN_REF_TTL_MS) return cached.refs
  // Claude Code encodes the session cwd by dashing every non-alphanumeric char.
  const encoded = projectPath.replace(/[^a-zA-Z0-9]/g, '-')
  const dir = join(homedir(), '.claude', 'projects', encoded)
  const refs = await grepPlanRefs(dir)
  planRefCache.set(projectPath, { at: Date.now(), refs })
  return refs
}

async function grepPlanRefs(dir: string): Promise<string[]> {
  try {
    await fs.access(dir)
  } catch {
    return [] // project has no transcripts on this machine
  }
  const env = (await resolveShellEnv()) as NodeJS.ProcessEnv
  return new Promise((resolve) => {
    const proc = spawn(
      'grep',
      ['-rhoE', '--include=*.jsonl', 'plans/[A-Za-z0-9._-]+\\.md', dir],
      { env }
    )
    const out: Buffer[] = []
    let size = 0
    const timer = setTimeout(() => proc.kill('SIGKILL'), 15_000)
    proc.stdout.on('data', (d: Buffer) => {
      size += d.length
      if (size > PLAN_REF_MAX_OUTPUT) proc.kill('SIGKILL')
      else out.push(d)
    })
    proc.stderr.on('data', () => {})
    proc.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
    proc.on('close', () => {
      clearTimeout(timer)
      const names = new Set<string>()
      for (const line of Buffer.concat(out).toString('utf8').split('\n')) {
        if (line) names.add(basename(line.trim()))
      }
      resolve([...names])
    })
  })
}
