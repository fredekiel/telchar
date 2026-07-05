// Versioned migration pipeline. Pure and Electron-free — unit-testable.
// Each migration contains a FROZEN snapshot of the schema it migrates FROM,
// so live schema changes in shared/types.ts can never silently alter it.

import { z } from 'zod'
import { DEFAULT_SIDEBAR, SCHEMA_VERSION } from '@shared/types'

// ---- frozen v1 schema (verbatim copy of persistence.ts as of schema v1) ----

const projectSchemaV1 = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

const tabSchemaV1 = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  })
])

const stateSchemaV1 = z.object({
  version: z.literal(1),
  projects: z.array(projectSchemaV1),
  layout: z.object({
    tabs: z.array(tabSchemaV1),
    activeTabId: z.string().nullable()
  }),
  scrollback: z.record(z.string()).optional()
})

// ---- frozen v2 schema (verbatim copy of persistence.ts as of schema v2) ----

const projectSchemaV2 = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

const tabSchemaV2 = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    wasRunningClaude: z.boolean().optional(),
    titlePinned: z.boolean().optional()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('empty'),
    projectId: z.string(),
    title: z.string()
  })
])

const dockEnvelopeSchemaV2 = z.object({
  lib: z.string(),
  libVersion: z.string(),
  grid: z.unknown()
})

const layoutSchemaV2 = z.object({
  id: z.string(),
  name: z.string(),
  dock: dockEnvelopeSchemaV2.nullable(),
  activeTabId: z.string().nullable()
})

const sidebarSchemaV2 = z.object({
  view: z.enum(['sessions', 'projects', 'plans', 'files', 'git', 'search']),
  width: z.number().min(120).max(800),
  collapsed: z.boolean(),
  scope: z.string().optional()
})

const stateSchemaV2 = z.object({
  version: z.literal(2),
  projects: z.array(projectSchemaV2),
  tabs: z.record(z.string(), tabSchemaV2),
  layouts: z.array(layoutSchemaV2).min(1),
  activeLayoutId: z.string(),
  sidebar: sidebarSchemaV2
})

// ---- frozen v3 schema (verbatim copy of persistence.ts as of schema v3) ----

const projectSchemaV3 = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

const tabSchemaV3 = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    wasRunningClaude: z.boolean().optional(),
    titlePinned: z.boolean().optional()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('empty'),
    projectId: z.string(),
    title: z.string()
  })
])

const dockEnvelopeSchemaV3 = z.object({
  lib: z.string(),
  libVersion: z.string(),
  grid: z.unknown()
})

const layoutSchemaV3 = z.object({
  id: z.string(),
  name: z.string(),
  dock: dockEnvelopeSchemaV3.nullable(),
  activeTabId: z.string().nullable()
})

const sidebarSchemaV3 = z.object({
  view: z.enum(['sessions', 'projects', 'plans', 'files', 'git', 'search']),
  width: z.number().min(120).max(800),
  collapsed: z.boolean(),
  selectedProjectId: z.string().optional()
})

const stateSchemaV3 = z.object({
  version: z.literal(3),
  projects: z.array(projectSchemaV3),
  tabs: z.record(z.string(), tabSchemaV3),
  layouts: z.array(layoutSchemaV3).min(1),
  activeLayoutId: z.string(),
  sidebar: sidebarSchemaV3
})

// ---- frozen v4 schema (verbatim copy of persistence.ts as of schema v4) ----

const projectSchemaV4 = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

const tabSchemaV4 = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    wasRunningClaude: z.boolean().optional(),
    titlePinned: z.boolean().optional()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    projectId: z.string(),
    title: z.string(),
    path: z.string()
  }),
  z.object({
    id: z.string(),
    kind: z.literal('empty'),
    projectId: z.string(),
    title: z.string()
  })
])

const dockEnvelopeSchemaV4 = z.object({
  lib: z.string(),
  libVersion: z.string(),
  grid: z.unknown()
})

const layoutSchemaV4 = z.object({
  id: z.string(),
  name: z.string(),
  dock: dockEnvelopeSchemaV4.nullable(),
  activeTabId: z.string().nullable()
})

const sidebarSchemaV4 = z.object({
  view: z.enum(['sessions', 'projects', 'plans', 'files', 'git', 'search']),
  width: z.number().min(120).max(800),
  collapsed: z.boolean(),
  selectedProjectId: z.string().optional()
})

const stateSchemaV4 = z.object({
  version: z.literal(4),
  projects: z.array(projectSchemaV4),
  tabs: z.record(z.string(), tabSchemaV4),
  layouts: z.array(layoutSchemaV4).min(1),
  activeLayoutId: z.string(),
  sidebar: sidebarSchemaV4,
  theme: z.enum(['dark', 'light', 'system'])
})

// ---- frozen v5 schema (verbatim copy of persistence.ts as of schema v5) ----
// v5 added optional decor fields (color/icon) on every tab kind and on layouts.

const decorFieldsV5 = {
  color: z.string().optional(),
  icon: z.string().optional()
}

const projectSchemaV5 = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  color: z.string(),
  collapsed: z.boolean()
})

const tabSchemaV5 = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('terminal'),
    projectId: z.string(),
    title: z.string(),
    cwd: z.string(),
    shell: z.string().optional(),
    wasRunningClaude: z.boolean().optional(),
    titlePinned: z.boolean().optional(),
    ...decorFieldsV5
  }),
  z.object({
    id: z.string(),
    kind: z.literal('plan'),
    projectId: z.string(),
    title: z.string(),
    path: z.string(),
    ...decorFieldsV5
  }),
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    projectId: z.string(),
    title: z.string(),
    path: z.string(),
    ...decorFieldsV5
  }),
  z.object({
    id: z.string(),
    kind: z.literal('empty'),
    projectId: z.string(),
    title: z.string(),
    ...decorFieldsV5
  })
])

const dockEnvelopeSchemaV5 = z.object({
  lib: z.string(),
  libVersion: z.string(),
  grid: z.unknown()
})

const layoutSchemaV5 = z.object({
  id: z.string(),
  name: z.string(),
  dock: dockEnvelopeSchemaV5.nullable(),
  activeTabId: z.string().nullable(),
  ...decorFieldsV5
})

const sidebarSchemaV5 = z.object({
  view: z.enum(['sessions', 'projects', 'plans', 'files', 'git', 'search']),
  width: z.number().min(120).max(800),
  collapsed: z.boolean(),
  selectedProjectId: z.string().optional()
})

const stateSchemaV5 = z.object({
  version: z.literal(5),
  projects: z.array(projectSchemaV5),
  tabs: z.record(z.string(), tabSchemaV5),
  layouts: z.array(layoutSchemaV5).min(1),
  activeLayoutId: z.string(),
  sidebar: sidebarSchemaV5,
  theme: z.enum(['dark', 'light', 'system'])
})

// ---- migrations ----

// v1 flat tab list -> v2 tabs map + single default layout with `dock: null`
// (the renderer builds the default one-group grid from the referenced tabs).
function migrateV1toV2(raw: unknown): unknown {
  const v1 = stateSchemaV1.parse(raw) // throws -> caller backs up + resets
  const tabs: Record<string, unknown> = {}
  for (const t of v1.layout.tabs) tabs[t.id] = t
  return {
    version: 2,
    projects: v1.projects,
    tabs,
    layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: v1.layout.activeTabId }],
    activeLayoutId: 'default',
    // v2's sidebar shape (with scope); v2->v3 normalizes it to selectedProjectId.
    sidebar: { ...DEFAULT_SIDEBAR, scope: 'all' }
    // v1.scrollback intentionally dropped (was declared but never written)
  }
}

// v2 sidebar.scope ('all' | projectId) -> v3 sidebar.selectedProjectId (always a
// real projectId, or absent when there are no projects — 'all' scope removed).
function migrateV2toV3(raw: unknown): unknown {
  const v2 = stateSchemaV2.parse(raw)
  const { scope, ...sidebar } = v2.sidebar
  const selectedProjectId =
    scope && v2.projects.some((p) => p.id === scope) ? scope : v2.projects[0]?.id
  return {
    ...v2,
    version: 3,
    sidebar: selectedProjectId !== undefined ? { ...sidebar, selectedProjectId } : sidebar
  }
}

// v3 -> v4: theme preference added; existing workspaces follow the OS.
function migrateV3toV4(raw: unknown): unknown {
  const v3 = stateSchemaV3.parse(raw)
  return { ...v3, version: 4, theme: 'system' }
}

// v4 -> v5: optional tab/layout color + icon added. No data change — the
// migration validates against the frozen v4 shape and stamps the version.
function migrateV4toV5(raw: unknown): unknown {
  const v4 = stateSchemaV4.parse(raw)
  return { ...v4, version: 5 }
}

// v5 -> v6: added the `planPreview` setting. Default to 'split' (auto-open the
// plan preview in a side split, the plugin-like behavior).
function migrateV5toV6(raw: unknown): unknown {
  const v5 = stateSchemaV5.parse(raw)
  return { ...v5, version: 6, planPreview: 'split' }
}

type Migration = (raw: unknown) => unknown
const migrations: Record<number, Migration> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6
}

export function readVersion(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return NaN
  return Number((raw as { version?: unknown }).version)
}

// Runs raw persisted JSON through every migration up to SCHEMA_VERSION.
// Throws on unknown version or migration failure — caller decides recovery.
export function runMigrations(raw: unknown): unknown {
  const v = readVersion(raw)
  if (!Number.isInteger(v) || v < 1 || v > SCHEMA_VERSION) {
    throw new Error(`unknown schema version: ${v}`)
  }
  let state = raw
  for (let i = v; i < SCHEMA_VERSION; i++) state = migrations[i](state)
  return state
}
