// Shared domain types. Imported by main, preload, and renderer.
// Persisted state is the renderer's source of truth (layout); runtime state lives in main only.

export type RuntimeStatus = 'connecting' | 'live' | 'exited' | 'restoring'

// Derived per-terminal attention state (runtime only, never persisted).
export type AttentionState = 'busy' | 'needs-input' | 'idle' | 'exited'

// Project dot colors — shared by the picker (renderer) and default assignment (main).
export const PROJECT_COLORS = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#f97316'
] as const

// Curated tab/layout tint colors — swatch row in the tab context menus.
// Rendered as color-mix tints + top stripes, never as raw backgrounds, so the
// same 8 mid-tone hues (+ Tokyo Night comment-blue) stay legible in both themes.
export const TAB_COLORS = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#f97316',
  '#9aa5ce'
] as const

export interface ProjectGroup {
  id: string
  name: string
  path: string
  color: string
  collapsed: boolean
}

// Discriminated union on `kind` — exhaustiveness-checked, no plugin registry.
export type TerminalTab = {
  id: string
  kind: 'terminal'
  projectId: string
  title: string
  cwd: string
  shell?: string
  // Set while the tab's foreground process is claude; gates auto-resume on restore.
  wasRunningClaude?: boolean
  // User renamed the tab — manual title outranks live OSC titles.
  titlePinned?: boolean
  // User-picked tint (TAB_COLORS hex) and emoji icon. Absent = default look.
  color?: string
  icon?: string
}

export type PlanTab = {
  id: string
  kind: 'plan'
  projectId: string
  title: string
  path: string
  color?: string
  icon?: string
}

// Placeholder tab: exists in a pane before its content is chosen. Converts
// in place via quick actions (new terminal / open file / open plan).
export type EmptyTab = {
  id: string
  kind: 'empty'
  projectId: string // '' — not owned by a project
  title: string
  color?: string
  icon?: string
}

export type FileTab = {
  id: string
  kind: 'file'
  projectId: string
  title: string
  path: string
  color?: string
  icon?: string
}

export type PersistedTab = TerminalTab | PlanTab | FileTab | EmptyTab
export type TabKind = PersistedTab['kind']

// Opaque envelope around the docking library's serialized grid. Only the dock
// adapter module (renderer) may interpret `grid`; main/zod never validate it.
export interface DockGridEnvelope {
  lib: string
  libVersion: string
  grid: unknown
}

// A named workspace: one dockable pane grid. `dock: null` => the renderer
// builds a default single-group grid from the tabs it references (also the
// migration / corrupt-grid recovery path).
export interface Layout {
  id: string
  name: string
  dock: DockGridEnvelope | null
  activeTabId: string | null
  color?: string
  icon?: string
}

export type SidebarView = 'sessions' | 'projects' | 'plans' | 'files' | 'git' | 'search'

export interface SidebarState {
  view: SidebarView
  width: number
  collapsed: boolean
  // The one selected project driving all sidebar views, status bar and ⌘T.
  // Undefined only while zero projects exist; consumers fall back to projects[0].
  selectedProjectId?: string
}

export const SCHEMA_VERSION = 6 as const

// Persisted theme preference. The resolved dark|light lives in the runtime
// store only — 'system' follows the OS via prefers-color-scheme.
export type ThemeMode = 'dark' | 'light' | 'system'

// How a Claude plan is surfaced when a new one is detected for a tab.
//   split  — auto-open the preview in a pane split right of the terminal (default)
//   tab    — auto-open the preview as a new tab in the same pane
//   prompt — no auto-open; emphasize the "View plan" button
//   off    — no auto-open; plain manual button only
export type PlanPreviewMode = 'split' | 'tab' | 'prompt' | 'off'

export interface PersistedState {
  version: typeof SCHEMA_VERSION
  projects: ProjectGroup[]
  // Tab metadata map is the authority; dock grids reference tabIds (panel id === tabId).
  tabs: Record<string, PersistedTab>
  layouts: Layout[] // always >= 1
  activeLayoutId: string
  sidebar: SidebarState
  theme: ThemeMode
  planPreview: PlanPreviewMode
}

export const DEFAULT_SIDEBAR: SidebarState = { view: 'sessions', width: 224, collapsed: false }

export function defaultState(): PersistedState {
  return {
    version: SCHEMA_VERSION,
    projects: [],
    tabs: {},
    // Fixed id keeps defaultState/migration pure (no uuid dependency in shared code).
    layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: null }],
    activeLayoutId: 'default',
    sidebar: { ...DEFAULT_SIDEBAR },
    theme: 'system',
    planPreview: 'split'
  }
}

// Options the renderer sends to spawn/ensure a pty. Validated in main.
export interface SpawnOptions {
  tabId: string
  cwd: string
  shell?: string
  cols: number
  rows: number
}

// ensure() result: `fresh` distinguishes a new spawn from reattaching to a
// live session (renderer reload/HMR) — the auto-resume gate.
export interface EnsureResult {
  status: RuntimeStatus
  fresh: boolean
}
