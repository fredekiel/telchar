// Versioned, validated workspace persistence (architecture principle 5).
// Load: parse -> versioned migrations -> zod validate. On failure the old
// file is backed up (never silently destroyed) and state resets to default;
// the returned notice lets the renderer tell the user where the backup went.
// Save: validate-before-write, atomic (temp file + fsync + rename).

import { app } from 'electron'
import { promises as fs, closeSync, fsyncSync, openSync, renameSync, writeSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { SCHEMA_VERSION, defaultState, type PersistedState } from '@shared/types'
import type { StateLoadResult } from '@shared/ipc'
import { readVersion, runMigrations } from './migrations'

const FILE = () => join(app.getPath('userData'), 'workspace.json')

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

// User-picked tab/layout tint + emoji icon (shared by every tab kind and layouts).
const decorFields = {
  color: z.string().optional(),
  icon: z.string().optional()
}

const tabSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    wasRunningClaude: z.boolean().optional(),
    titlePinned: z.boolean().optional(),
    ...decorFields
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string(),
    ...decorFields
  }),
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    projectId: z.string(),
    title: z.string(),
    path: z.string(),
    ...decorFields
  }),
  z.object({
    id: z.string(),
    kind: z.literal('empty'),
    projectId: z.string(),
    title: z.string(),
    ...decorFields
  })
])

// The dock grid is the docking lib's own serialized shape — deliberately
// unvalidated (z.unknown). The renderer's dock adapter is the real gate.
const dockEnvelopeSchema = z.object({
  lib: z.string(),
  libVersion: z.string(),
  grid: z.unknown()
})

const layoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  dock: dockEnvelopeSchema.nullable(),
  activeTabId: z.string().nullable(),
  ...decorFields
})

const sidebarSchema = z.object({
  view: z.enum(['sessions', 'projects', 'plans', 'files', 'git', 'search']),
  width: z.number().min(120).max(800),
  collapsed: z.boolean(),
  selectedProjectId: z.string().optional()
})

const stateSchema = z.object({
  version: z.literal(SCHEMA_VERSION),
  projects: z.array(projectSchema),
  tabs: z.record(z.string(), tabSchema),
  layouts: z.array(layoutSchema).min(1),
  activeLayoutId: z.string(),
  sidebar: sidebarSchema,
  theme: z.enum(['dark', 'light', 'system']),
  planPreview: z.enum(['split', 'tab', 'prompt', 'off'])
})

const BACKUPS_KEPT = 5

// Timestamped backups accumulate one per reset event — keep the newest few.
async function pruneBackups(): Promise<void> {
  try {
    const dir = app.getPath('userData')
    const prefix = 'workspace.json.bak-'
    // Epoch-ms suffixes are fixed-width for centuries: lexical sort = age sort.
    const baks = (await fs.readdir(dir)).filter((f) => f.startsWith(prefix)).sort()
    for (const f of baks.slice(0, Math.max(0, baks.length - BACKUPS_KEPT))) {
      await fs.unlink(join(dir, f)).catch(() => {})
    }
  } catch {
    /* best effort */
  }
}

async function backupCorruptFile(): Promise<string | undefined> {
  const target = `${FILE()}.bak-${Date.now()}`
  try {
    await fs.rename(FILE(), target)
    await pruneBackups()
    return target
  } catch {
    return undefined // nothing to back up
  }
}

export async function loadState(): Promise<StateLoadResult> {
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(FILE(), 'utf8'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { state: defaultState() } // no file yet — fresh start, no backup noise
    }
    // Unreadable or truncated (power loss can cut the file mid-write) — keep
    // the evidence before resetting.
    const backupPath = await backupCorruptFile()
    return { state: defaultState(), notice: { kind: 'corrupt-reset', backupPath } }
  }
  try {
    // One-time upgrade insurance: keep a copy of the pre-migration file.
    const v = readVersion(raw)
    if (Number.isInteger(v) && v < SCHEMA_VERSION) {
      await fs.copyFile(FILE(), join(app.getPath('userData'), `workspace.v${v}.json`)).catch(() => {})
    }
    const migrated = runMigrations(raw)
    const parsed = stateSchema.safeParse(migrated)
    if (parsed.success) return { state: parsed.data as PersistedState }
    throw new Error(parsed.error.message)
  } catch {
    const newer = readVersion(raw) > SCHEMA_VERSION // file from a newer app build
    const backupPath = await backupCorruptFile()
    return {
      state: defaultState(),
      notice: { kind: newer ? 'newer-version-reset' : 'corrupt-reset', backupPath }
    }
  }
}

// Last state that passed validation — re-flushed on quit as a second layer
// under the renderer's beforeunload saveSync (which carries the freshest copy).
let lastGoodState: PersistedState | null = null

export async function saveState(state: PersistedState): Promise<void> {
  const parsed = stateSchema.safeParse(state)
  if (!parsed.success) return // never persist garbage
  lastGoodState = parsed.data as PersistedState
  const target = FILE()
  const tmp = `${target}.${process.pid}.tmp`
  const fh = await fs.open(tmp, 'w')
  try {
    await fh.writeFile(JSON.stringify(parsed.data, null, 2), 'utf8')
    await fh.sync() // durable before rename — APFS may reorder on power loss
  } finally {
    await fh.close()
  }
  await fs.rename(tmp, target) // atomic
}

export function saveStateSync(state: unknown): void {
  const parsed = stateSchema.safeParse(state)
  if (!parsed.success) return // never persist garbage
  lastGoodState = parsed.data as PersistedState
  const target = FILE()
  const tmp = `${target}.${process.pid}.tmp`
  const fd = openSync(tmp, 'w')
  try {
    writeSync(fd, JSON.stringify(parsed.data, null, 2))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, target) // atomic
}

// Belt-and-braces for before-quit and last-gasp crash handlers.
export function flushStateSync(): void {
  try {
    if (lastGoodState) saveStateSync(lastGoodState)
  } catch {
    /* a failed flush must never block quitting */
  }
}
