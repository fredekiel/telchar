// Filesystem access for the file tree, viewer and quick-open — reads plus the
// write/create/rename/delete verbs. Callers (ipc.ts) containment-check every
// path BEFORE calling in here (create/rename-dest guard the parent dir).

import { promises as fs } from 'fs'
import { join, relative } from 'path'
import { spawn } from 'child_process'
import type { DirEntry, DirListing, FileContent, FileList, FsWriteResult } from '@shared/ipc'
import { resolveShellEnv } from './env'

const DIR_CAP = 2000
const FILE_CAP_BYTES = 1024 * 1024
const LIST_CAP = 20_000
const LIST_TTL_MS = 10_000
const WALK_DEPTH = 12
const WALK_TIME_BUDGET_MS = 2000
const WALK_SKIP = new Set(['.git', 'node_modules', '.venv', 'venv', 'dist', 'out', 'release'])

export async function readDir(path: string): Promise<DirListing> {
  const dirents = await fs.readdir(path, { withFileTypes: true })
  const entries: DirEntry[] = dirents.slice(0, DIR_CAP).map((d) => ({
    name: d.name,
    path: join(path, d.name),
    kind: d.isDirectory() ? 'dir' : d.isFile() ? 'file' : d.isSymbolicLink() ? 'symlink' : 'other'
  }))
  entries.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : b.kind === 'dir' ? 1 : 0
  )
  return { entries, truncated: dirents.length > DIR_CAP }
}

export async function readFile(path: string): Promise<FileContent> {
  const fd = await fs.open(path, 'r')
  try {
    const stat = await fd.stat()
    const len = Math.min(stat.size, FILE_CAP_BYTES)
    const buf = Buffer.alloc(len)
    await fd.read(buf, 0, len, 0)
    // NUL byte in the first 8KiB => treat as binary, don't ship content.
    const sniff = buf.subarray(0, 8192)
    if (sniff.includes(0)) return { content: '', size: stat.size, truncated: false, binary: true }
    return { content: buf.toString('utf8'), size: stat.size, truncated: stat.size > FILE_CAP_BYTES, binary: false }
  } finally {
    await fd.close()
  }
}

// ---- writes (paths already containment-checked by ipc.ts) ----

async function guarded(op: () => Promise<void>): Promise<FsWriteResult> {
  try {
    await op()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function writeFile(path: string, content: string): Promise<FsWriteResult> {
  return guarded(() => fs.writeFile(path, content, 'utf8'))
}

// wx: fail if the file already exists (never clobber via "New File").
export function createFile(path: string): Promise<FsWriteResult> {
  return guarded(() => fs.writeFile(path, '', { flag: 'wx' }))
}

// non-recursive: the parent must already exist (it's the containment-checked root).
export function createDir(path: string): Promise<FsWriteResult> {
  return guarded(async () => {
    await fs.mkdir(path)
  })
}

export function rename(from: string, to: string): Promise<FsWriteResult> {
  return guarded(() => fs.rename(from, to))
}

export function deletePath(path: string): Promise<FsWriteResult> {
  return guarded(() => fs.rm(path, { recursive: true, force: false }))
}

const listCache = new Map<string, { at: number; value: FileList }>()

export async function listFiles(projectPath: string): Promise<FileList> {
  const cached = listCache.get(projectPath)
  if (cached && Date.now() - cached.at < LIST_TTL_MS) return cached.value

  const value = (await gitListFiles(projectPath)) ?? (await walkFiles(projectPath))
  listCache.set(projectPath, { at: Date.now(), value })
  return value
}

async function gitListFiles(projectPath: string): Promise<FileList | null> {
  const env = { ...(await resolveShellEnv()), GIT_OPTIONAL_LOCKS: '0' }
  return new Promise((resolve) => {
    const proc = spawn('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: projectPath,
      env: env as NodeJS.ProcessEnv
    })
    const out: Buffer[] = []
    const timer = setTimeout(() => proc.kill('SIGKILL'), 10_000)
    proc.stdout.on('data', (d: Buffer) => out.push(d))
    proc.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return resolve(null)
      const all = Buffer.concat(out).toString('utf8').split('\0').filter(Boolean)
      resolve({ files: all.slice(0, LIST_CAP), truncated: all.length > LIST_CAP })
    })
  })
}

async function walkFiles(root: string): Promise<FileList> {
  const files: string[] = []
  const deadline = Date.now() + WALK_TIME_BUDGET_MS
  let truncated = false

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > WALK_DEPTH || files.length >= LIST_CAP || Date.now() > deadline) {
      truncated = true
      return
    }
    let dirents
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of dirents) {
      if (files.length >= LIST_CAP || Date.now() > deadline) {
        truncated = true
        return
      }
      if (d.isDirectory()) {
        if (!WALK_SKIP.has(d.name) && !d.name.startsWith('.')) await walk(join(dir, d.name), depth + 1)
      } else if (d.isFile()) {
        files.push(relative(root, join(dir, d.name)))
      }
    }
  }

  await walk(root, 0)
  return { files, truncated }
}
