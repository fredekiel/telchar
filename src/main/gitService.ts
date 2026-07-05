// Per-project git status + quick actions. Spawned `git` only (zero native
// deps), chokidar on .git METADATA only (never the worktree — that's the
// 10-project cost cliff). Worktree-edit staleness is compensated by refresh
// on window focus, after actions, when the git/files view opens, and — for
// the selected project while the Files view is open — by worktreeWatcher.ts.

import { spawn } from 'child_process'
import { join } from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import type { GitActionResult, GitFileEntry, GitProjectStatus } from '@shared/ipc'
import { resolveShellEnv } from './env'

const DEBOUNCE_MS = 300
const STATUS_TIMEOUT_MS = 10_000
const ACTION_TIMEOUT_MS = 60_000
const MAX_FILES = 500

interface RepoEntry {
  projectId: string
  projectPath: string
  repoRoot: string | null
  gitDir: string | null
  watcher: FSWatcher | null
  running: boolean
  rerun: boolean
  debounce: NodeJS.Timeout | null
  lastPayload: string
}

type GitSink = (status: GitProjectStatus) => void

async function runGit(
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env = {
    ...(await resolveShellEnv()),
    GIT_OPTIONAL_LOCKS: '0', // status must not write .git/index (watcher feedback loop)
    GIT_TERMINAL_PROMPT: '0' // never hang on credential prompts
  }
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd, env: env as NodeJS.ProcessEnv })
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    proc.stdout.on('data', (d: Buffer) => out.push(d))
    proc.stderr.on('data', (d: Buffer) => err.push(d))
    proc.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, stdout: '', stderr: String(e) })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') })
    })
  })
}

// ---- porcelain v2 -z parser (pure, unit-tested) ----

export function parsePorcelainV2(
  raw: string
): Pick<GitProjectStatus, 'branch' | 'upstream' | 'ahead' | 'behind' | 'files' | 'fileTotal'> {
  const tokens = raw.split('\0').filter((t) => t.length > 0)
  const files: GitFileEntry[] = []
  let total = 0
  let branch: string | undefined
  let upstream: string | undefined
  let ahead: number | undefined
  let behind: number | undefined

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.startsWith('# branch.head ')) branch = t.slice('# branch.head '.length)
    else if (t.startsWith('# branch.upstream ')) upstream = t.slice('# branch.upstream '.length)
    else if (t.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(t)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (t.startsWith('1 ')) {
      const parts = t.split(' ')
      const xy = parts[1]
      const path = parts.slice(8).join(' ')
      total++
      if (files.length < MAX_FILES) files.push({ path, index: xy[0], worktree: xy[1] })
    } else if (t.startsWith('2 ')) {
      const parts = t.split(' ')
      const xy = parts[1]
      const path = parts.slice(9).join(' ')
      const renamedFrom = tokens[++i] // -z: original path follows as its own token
      total++
      if (files.length < MAX_FILES) files.push({ path, index: xy[0], worktree: xy[1], renamedFrom })
    } else if (t.startsWith('u ')) {
      const parts = t.split(' ')
      const path = parts.slice(10).join(' ')
      total++
      if (files.length < MAX_FILES) files.push({ path, index: 'U', worktree: 'U' })
    } else if (t.startsWith('? ')) {
      total++
      if (files.length < MAX_FILES) files.push({ path: t.slice(2), index: '?', worktree: '?' })
    }
    // '!' (ignored) entries are not requested; headers we don't use are skipped.
  }
  return { branch, upstream, ahead, behind, files, fileTotal: total }
}

// ---- service ----

export class GitService {
  private repos = new Map<string, RepoEntry>()
  private sink: GitSink = () => {}

  setSink(sink: GitSink): void {
    this.sink = sink
  }

  async watch(projectId: string, projectPath: string): Promise<GitProjectStatus> {
    this.unwatch(projectId)
    const entry: RepoEntry = {
      projectId,
      projectPath,
      repoRoot: null,
      gitDir: null,
      watcher: null,
      running: false,
      rerun: false,
      debounce: null,
      lastPayload: ''
    }
    this.repos.set(projectId, entry)

    // Discovery: handles non-repo projects AND projects nested inside a repo.
    const res = await runGit(
      ['rev-parse', '--show-toplevel', '--absolute-git-dir'],
      projectPath,
      STATUS_TIMEOUT_MS
    )
    if (res.code !== 0) {
      const status: GitProjectStatus = { projectId, repo: false, files: [], fileTotal: 0, updatedAt: Date.now() }
      this.sink(status)
      return status
    }
    const [repoRoot, gitDir] = res.stdout.trim().split('\n')
    entry.repoRoot = repoRoot
    entry.gitDir = gitDir

    // Watch ~5 metadata paths per repo — cheap even across many projects.
    entry.watcher = chokidar.watch(
      [
        join(gitDir, 'HEAD'),
        join(gitDir, 'index'),
        join(gitDir, 'refs'),
        join(gitDir, 'packed-refs'),
        join(gitDir, 'MERGE_HEAD')
      ],
      { ignoreInitial: true }
    )
    entry.watcher.on('all', () => this.scheduleRefresh(entry))
    entry.watcher.on('error', () => {})

    return this.refresh(projectId)
  }

  unwatch(projectId: string): void {
    const entry = this.repos.get(projectId)
    if (!entry) return
    if (entry.debounce) clearTimeout(entry.debounce)
    void entry.watcher?.close()
    this.repos.delete(projectId)
  }

  closeAll(): void {
    for (const id of [...this.repos.keys()]) this.unwatch(id)
  }

  refreshAll(): void {
    for (const entry of this.repos.values()) this.scheduleRefresh(entry)
  }

  private scheduleRefresh(entry: RepoEntry): void {
    if (entry.debounce) clearTimeout(entry.debounce)
    entry.debounce = setTimeout(() => void this.refresh(entry.projectId), DEBOUNCE_MS)
  }

  async refresh(projectId: string): Promise<GitProjectStatus> {
    const entry = this.repos.get(projectId)
    const notFound: GitProjectStatus = { projectId, repo: false, files: [], fileTotal: 0, updatedAt: Date.now() }
    if (!entry) return notFound
    if (!entry.repoRoot) {
      return { ...notFound, updatedAt: Date.now() }
    }
    if (entry.running) {
      entry.rerun = true // single-flight: coalesce bursts into one trailing run
      return this.currentStatus(entry)
    }
    entry.running = true
    try {
      const res = await runGit(
        ['status', '--porcelain=v2', '--branch', '-z'],
        entry.repoRoot,
        STATUS_TIMEOUT_MS
      )
      const status: GitProjectStatus =
        res.code === 0
          ? {
              projectId,
              repo: true,
              repoRoot: entry.repoRoot,
              ...parsePorcelainV2(res.stdout),
              updatedAt: Date.now()
            }
          : { ...notFound, updatedAt: Date.now() }
      const payload = JSON.stringify({ ...status, updatedAt: 0 })
      if (payload !== entry.lastPayload) {
        entry.lastPayload = payload
        this.sink(status)
      }
      return status
    } finally {
      entry.running = false
      if (entry.rerun) {
        entry.rerun = false
        this.scheduleRefresh(entry)
      }
    }
  }

  private currentStatus(entry: RepoEntry): GitProjectStatus {
    if (entry.lastPayload) {
      try {
        return { ...(JSON.parse(entry.lastPayload) as GitProjectStatus), updatedAt: Date.now() }
      } catch {
        /* fall through */
      }
    }
    return { projectId: entry.projectId, repo: !!entry.repoRoot, files: [], fileTotal: 0, updatedAt: Date.now() }
  }

  // ---- quick actions (argv arrays — user input never touches a shell) ----

  async commitAll(projectId: string, message: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    const add = await runGit(['add', '-A'], entry.repoRoot, ACTION_TIMEOUT_MS)
    if (add.code !== 0) return this.actionResult(entry, add)
    const commit = await runGit(['commit', '-m', message], entry.repoRoot, ACTION_TIMEOUT_MS)
    return this.actionResult(entry, commit)
  }

  async pull(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['pull'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  async push(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['push'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  async fetch(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['fetch'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  async stashPush(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['stash', 'push', '-u'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  async stashPop(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['stash', 'pop'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  // Resets tracked changes (staged + unstaged) to HEAD, then removes untracked
  // files/dirs. Destructive — the renderer gates this behind a confirm; main
  // just executes.
  async discardAll(projectId: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    const reset = await runGit(['reset', '--hard', 'HEAD'], entry.repoRoot, ACTION_TIMEOUT_MS)
    if (reset.code !== 0) return this.actionResult(entry, reset)
    return this.actionResult(entry, await runGit(['clean', '-fd'], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  // Per-file staging. paths are repo-relative; a directory stages its subtree.
  // '--' terminates flags so a path can't be read as an option.
  async stage(projectId: string, paths: string[]): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['add', '--', ...paths], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  // `reset -q -- <paths>` (not `restore --staged`, which fatals with "could not
  // resolve HEAD" before the initial commit) — works whether or not HEAD exists.
  async unstage(projectId: string, paths: string[]): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['reset', '-q', '--', ...paths], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  // Commit only what is already staged (no add -A). commitAll stays for the
  // "stage everything then commit" one-click path.
  async commit(projectId: string, message: string): Promise<GitActionResult> {
    const entry = this.repos.get(projectId)
    if (!entry?.repoRoot) return { ok: false, code: null, stdout: '', stderr: 'not a git repository' }
    return this.actionResult(entry, await runGit(['commit', '-m', message], entry.repoRoot, ACTION_TIMEOUT_MS))
  }

  private actionResult(
    entry: RepoEntry,
    res: { code: number | null; stdout: string; stderr: string }
  ): GitActionResult {
    this.scheduleRefresh(entry) // status after every action
    return { ok: res.code === 0, code: res.code, stdout: res.stdout, stderr: res.stderr }
  }
}

export const gitService = new GitService()
