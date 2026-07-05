// Renderer state = the source of truth for serializable layout (principle 1).
// Mutations go through pure reducers, then debounce-persist to main.
// Geometry ops route through dockActions (the per-layout dockview bridge);
// tab EXISTENCE lives here, tab PLACEMENT lives in the dock envelopes.

import { create } from 'zustand'
import { randomUUID } from './uuid'
import {
  defaultState,
  type PersistedState,
  type PersistedTab,
  type ProjectGroup,
  type SidebarState,
  type TerminalTab,
  type ThemeMode,
  type PlanPreviewMode
} from '@shared/types'
import type { StateLoadNotice } from '@shared/ipc'
import * as R from './state/reducers'
import { useRuntime, needsInputQueue } from './state/runtime'
import { allDocks, dockFor, type SplitDirection } from './components/dock/dockActions'

export interface Placement {
  layoutId: string
  split?: SplitDirection
}

// Why the workspace came up non-normally: persistence reset it (with a backup
// on disk) or the load IPC itself failed. Drives a dismissible banner.
export type LoadNotice = StateLoadNotice | { kind: 'load-failed'; backupPath?: undefined }

interface Store {
  state: PersistedState
  hydrated: boolean
  loadNotice: LoadNotice | null
  overviewOpen: boolean
  keybindsOpen: boolean
  settingsOpen: boolean
  paletteOpen: false | 'files' | 'commands'
  // tabId -> intended layout for panels not yet in any envelope.
  pendingPlacement: Record<string, Placement>

  load: () => Promise<void>
  dismissLoadNotice: () => void

  // projects
  addProject: () => Promise<void>
  removeProject: (projectId: string) => void
  selectProject: (projectId: string) => void
  toggleCollapsed: (projectId: string) => void
  renameProject: (projectId: string, name: string) => void
  setProjectColor: (projectId: string, color: string) => void

  // tabs
  newTerminal: (project: ProjectGroup, split?: SplitDirection) => void
  openPlan: (project: ProjectGroup, path: string, title: string, split?: SplitDirection) => void
  openFile: (project: ProjectGroup, path: string, title: string) => void
  // Auto-open a tab's newly-detected plan per the planPreview setting. seedOnly
  // records the current plan as already-surfaced WITHOUT opening (first
  // observation / session start), so a stale plan never pops up on launch.
  surfacePlanForTab: (tabId: string, opts?: { seedOnly?: boolean }) => void
  closeTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void
  setTabColor: (tabId: string, color: string | undefined) => void
  setTabIcon: (tabId: string, icon: string | undefined) => void
  unpinTabTitle: (tabId: string) => void
  setActive: (tabId: string) => void
  setActiveInLayout: (layoutId: string, tabId: string | null) => void
  setTabClaudeFlag: (tabId: string, isClaude: boolean) => void
  claimPlacement: (tabId: string) => Placement | undefined
  unplacedTabIds: () => string[]

  // layouts
  newLayout: () => void
  renameLayout: (layoutId: string, name: string) => void
  setLayoutColor: (layoutId: string, color: string | undefined) => void
  setLayoutIcon: (layoutId: string, icon: string | undefined) => void
  deleteLayout: (layoutId: string) => void
  switchLayout: (layoutId: string) => void
  cycleLayout: (delta: number) => void
  setDockEnvelope: (layoutId: string, dock: NonNullable<PersistedState['layouts'][number]['dock']>) => void
  moveTabToLayout: (tabId: string, targetLayoutId: string) => void

  // sidebar / overlays
  setSidebar: (patch: Partial<SidebarState>) => void
  toggleSidebar: () => void
  setOverview: (open: boolean) => void
  setKeybinds: (open: boolean) => void
  setSettings: (open: boolean) => void
  setPalette: (mode: false | 'files' | 'commands') => void
  setTheme: (theme: ThemeMode) => void
  setPlanPreview: (mode: PlanPreviewMode) => void
  newEmptyTab: () => void

  // shortcut helpers
  newTerminalSelectedProject: () => void
  splitActive: (dir: SplitDirection) => void
  closeActiveTab: () => void
  jumpToTab: (tabId: string) => void
  jumpAttention: () => void
}

// The one selected project (sidebar combobox). Drives all sidebar views,
// status bar and ⌘T. Undefined only when zero projects exist; the fallback
// to projects[0] guards against a stale persisted id.
export function selectedProject(s: PersistedState): ProjectGroup | undefined {
  return s.projects.find((p) => p.id === s.sidebar.selectedProjectId) ?? s.projects[0]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
// When the load IPC itself failed we run on in-memory defaults; persisting
// those would clobber the (possibly fine) workspace.json on disk.
let persistSuppressed = false

export const useStore = create<Store>((set, get) => {
  const apply = (next: PersistedState) => {
    set({ state: next })
    if (persistSuppressed) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void window.telchar.state.save(get().state), 250)
  }

  const addTabToLayout = (tab: PersistedTab, split?: SplitDirection) => {
    const layoutId = get().state.activeLayoutId
    set({ pendingPlacement: { ...get().pendingPlacement, [tab.id]: { layoutId, split } } })
    apply(R.addTab(get().state, layoutId, tab))
    // DockHost reconciles from pendingPlacement; call through directly when ready
    // so the panel appears this frame instead of next effect tick.
    dockFor(layoutId)?.addTabPanel(tab, split)
  }

  return {
    state: defaultState(),
    hydrated: false,
    loadNotice: null,
    overviewOpen: false,
    keybindsOpen: false,
    settingsOpen: false,
    paletteOpen: false,
    pendingPlacement: {},

    load: async () => {
      let loaded: PersistedState
      try {
        const result = await window.telchar.state.load()
        loaded = result.state
        set({ state: loaded, hydrated: true, loadNotice: result.notice ?? null })
      } catch (err) {
        // IPC-layer failure — boot usable with defaults instead of hanging on
        // the hydration spinner forever. Saves stay off so the defaults never
        // overwrite whatever is on disk.
        console.error('[telchar] state load failed:', err)
        persistSuppressed = true
        loaded = defaultState()
        set({ state: loaded, hydrated: true, loadNotice: { kind: 'load-failed' } })
      }
      // Git watches are runtime — re-register on every hydrate.
      for (const p of loaded.projects) {
        void window.telchar.git.watch(p.id, p.path).then(useRuntime.getState().applyGit)
      }
    },
    dismissLoadNotice: () => set({ loadNotice: null }),

    // ---- projects ----

    addProject: async () => {
      const project = await window.telchar.project.pick()
      if (!project) return
      apply(R.addProject(get().state, project))
      void window.telchar.git.watch(project.id, project.path).then(useRuntime.getState().applyGit)
    },

    removeProject: (projectId) => {
      for (const tab of R.tabsForProject(get().state, projectId)) {
        if (tab.kind === 'terminal') window.telchar.pty.kill(tab.id)
        const layoutId = useRuntime.getState().tabLayout[tab.id]
        if (layoutId) dockFor(layoutId)?.removeTabPanel(tab.id)
        useRuntime.getState().remove(tab.id)
      }
      window.telchar.git.unwatch(projectId)
      useRuntime.getState().removeGit(projectId)
      apply(R.removeProject(get().state, projectId))
    },

    selectProject: (projectId) => apply(R.selectProject(get().state, projectId)),
    toggleCollapsed: (projectId) => apply(R.toggleCollapsed(get().state, projectId)),
    renameProject: (projectId, name) => apply(R.renameProject(get().state, projectId, name)),
    setProjectColor: (projectId, color) => apply(R.setProjectColor(get().state, projectId, color)),

    // ---- tabs ----

    newTerminal: (project, split) => {
      // Numbered default so sibling terminals stay distinguishable until an
      // OSC title (or manual rename) takes over.
      const siblings = Object.values(get().state.tabs).filter(
        (t) => t.kind === 'terminal' && t.projectId === project.id
      ).length
      const tab: TerminalTab = {
        id: randomUUID(),
        kind: 'terminal',
        projectId: project.id,
        title: siblings === 0 ? project.name : `${project.name} · ${siblings + 1}`,
        cwd: project.path
      }
      addTabToLayout(tab, split)
    },

    openPlan: (project, path, title, split) => {
      const existing = Object.values(get().state.tabs).find((t) => t.kind === 'plan' && t.path === path)
      if (existing) return get().jumpToTab(existing.id)
      addTabToLayout({ id: randomUUID(), kind: 'plan', projectId: project.id, title, path }, split)
    },

    surfacePlanForTab: (tabId, opts) => {
      const rt = useRuntime.getState()
      const entry = rt.byTab[tabId]
      const planPath = entry?.claude?.planPath
      if (!planPath || entry?.surfacedPlan === planPath) return
      // Record before opening — closing the preview must never re-trigger it,
      // and only a genuinely new plan path (not content updates) re-surfaces.
      rt.setSurfacedPlan(tabId, planPath)
      if (opts?.seedOnly) return
      const s = get()
      const mode = s.state.planPreview
      if (mode !== 'split' && mode !== 'tab') return
      const tab = s.state.tabs[tabId]
      const project = tab && s.state.projects.find((p) => p.id === tab.projectId)
      if (!project) return
      const title = entry?.claude?.planTitle ?? 'Plan'
      get().openPlan(project, planPath, title, mode === 'split' ? 'right' : undefined)
    },

    openFile: (project, path, title) => {
      // Markdown opens rendered (live-updating plan viewer) rather than as
      // codemirror source — same treatment plan files get.
      if (path.endsWith('.md')) return get().openPlan(project, path, title)
      const existing = Object.values(get().state.tabs).find((t) => t.kind === 'file' && t.path === path)
      if (existing) return get().jumpToTab(existing.id)
      addTabToLayout({ id: randomUUID(), kind: 'file', projectId: project.id, title, path })
    },

    closeTab: (tabId) => {
      const tab = get().state.tabs[tabId]
      if (!tab) return
      if (tab.kind === 'terminal') window.telchar.pty.kill(tabId)
      const layoutId = useRuntime.getState().tabLayout[tabId] ?? get().state.activeLayoutId
      dockFor(layoutId)?.removeTabPanel(tabId)
      useRuntime.getState().remove(tabId)
      const pending = { ...get().pendingPlacement }
      delete pending[tabId]
      set({ pendingPlacement: pending })
      apply(R.closeTab(get().state, tabId))
    },

    renameTab: (tabId, title) => apply(R.renameTab(get().state, tabId, title)),
    setTabColor: (tabId, color) => apply(R.setTabColor(get().state, tabId, color)),
    setTabIcon: (tabId, icon) => apply(R.setTabIcon(get().state, tabId, icon)),
    unpinTabTitle: (tabId) => apply(R.unpinTabTitle(get().state, tabId)),

    setActive: (tabId) => {
      const layoutId =
        useRuntime.getState().tabLayout[tabId] ??
        get().pendingPlacement[tabId]?.layoutId ??
        get().state.activeLayoutId
      let next = get().state
      if (layoutId !== next.activeLayoutId) next = R.setActiveLayout(next, layoutId)
      apply(R.setActiveTab(next, layoutId, tabId))
    },

    setActiveInLayout: (layoutId, tabId) => apply(R.setActiveTab(get().state, layoutId, tabId)),
    setTabClaudeFlag: (tabId, isClaude) => apply(R.setTabClaudeFlag(get().state, tabId, isClaude)),

    claimPlacement: (tabId) => {
      const placement = get().pendingPlacement[tabId]
      if (!placement) return undefined
      const pending = { ...get().pendingPlacement }
      delete pending[tabId]
      set({ pendingPlacement: pending })
      return placement
    },

    // Tabs referenced by no envelope and no pending placement — the active
    // layout's host adopts them (crash-window orphans, migration leftovers).
    unplacedTabIds: () => {
      const s = get().state
      const placed = new Set<string>(Object.keys(useRuntime.getState().tabLayout))
      for (const id of Object.keys(get().pendingPlacement)) placed.add(id)
      for (const l of s.layouts) {
        // envelopes are authoritative even before runtime index catches up
        if (l.dock) for (const id of referencedIdsSafe(l)) placed.add(id)
      }
      return Object.keys(s.tabs).filter((id) => !placed.has(id))
    },

    // ---- layouts ----

    newLayout: () => {
      const n = get().state.layouts.length + 1
      apply(R.createLayout(get().state, randomUUID(), `Layout ${n}`))
    },

    renameLayout: (layoutId, name) => apply(R.renameLayout(get().state, layoutId, name)),
    setLayoutColor: (layoutId, color) => apply(R.setLayoutColor(get().state, layoutId, color)),
    setLayoutIcon: (layoutId, icon) => apply(R.setLayoutIcon(get().state, layoutId, icon)),

    deleteLayout: (layoutId) => {
      const s = get().state
      if (s.layouts.length <= 1) return
      const layout = s.layouts.find((l) => l.id === layoutId)
      if (!layout) return
      const owned = new Set(referencedIdsSafe(layout))
      for (const [tabId, l] of Object.entries(useRuntime.getState().tabLayout)) {
        if (l === layoutId) owned.add(tabId)
      }
      for (const tabId of owned) {
        const tab = s.tabs[tabId]
        if (tab?.kind === 'terminal') window.telchar.pty.kill(tabId)
        useRuntime.getState().remove(tabId)
      }
      apply(R.deleteLayout(s, layoutId, [...owned]))
    },

    switchLayout: (layoutId) => apply(R.setActiveLayout(get().state, layoutId)),

    cycleLayout: (delta) => {
      const { layouts, activeLayoutId } = get().state
      const i = layouts.findIndex((l) => l.id === activeLayoutId)
      const next = layouts[(((i < 0 ? 0 : i) + delta) % layouts.length + layouts.length) % layouts.length]
      get().switchLayout(next.id)
    },

    setDockEnvelope: (layoutId, dock) => apply(R.setDockEnvelope(get().state, layoutId, dock)),

    moveTabToLayout: (tabId, targetLayoutId) => {
      const tab = get().state.tabs[tabId]
      if (!tab || targetLayoutId === useRuntime.getState().tabLayout[tabId]) return
      const sourceLayoutId = useRuntime.getState().tabLayout[tabId]
      if (sourceLayoutId) dockFor(sourceLayoutId)?.removeTabPanel(tabId)
      set({ pendingPlacement: { ...get().pendingPlacement, [tabId]: { layoutId: targetLayoutId } } })
      dockFor(targetLayoutId)?.addTabPanel(tab)
      apply(R.setActiveTab(get().state, targetLayoutId, tabId))
    },

    // ---- sidebar / overlays ----

    setSidebar: (patch) => apply(R.setSidebar(get().state, patch)),
    toggleSidebar: () => apply(R.setSidebar(get().state, { collapsed: !get().state.sidebar.collapsed })),
    setOverview: (open) => set({ overviewOpen: open }),
    setKeybinds: (open) => set({ keybindsOpen: open }),
    setSettings: (open) => set({ settingsOpen: open }),
    setPalette: (mode) => set({ paletteOpen: mode }),
    setTheme: (theme) => apply(R.setTheme(get().state, theme)),
    setPlanPreview: (mode) => apply(R.setPlanPreview(get().state, mode)),

    newEmptyTab: () => {
      addTabToLayout({ id: randomUUID(), kind: 'empty', projectId: '', title: 'New Tab' })
    },

    // ---- shortcut helpers ----

    newTerminalSelectedProject: () => {
      const project = selectedProject(get().state)
      if (project) get().newTerminal(project)
    },

    splitActive: (dir) => {
      const s = get().state
      const tab = R.activeTab(s)
      // Split spawns a sibling shell in the same project+cwd (the dominant
      // claude workflow); falls back to the selected project.
      const project = s.projects.find((p) => p.id === tab?.projectId) ?? selectedProject(s)
      if (!project) return
      const cwd = tab?.kind === 'terminal' ? tab.cwd : project.path
      get().newTerminal({ ...project, path: cwd }, dir)
    },

    closeActiveTab: () => {
      const id = R.activeLayout(get().state).activeTabId
      if (id) get().closeTab(id)
    },

    jumpToTab: (tabId) => {
      get().setActive(tabId)
      const layoutId = useRuntime.getState().tabLayout[tabId] ?? get().state.activeLayoutId
      dockFor(layoutId)?.focusTab(tabId)
      useRuntime.getState().clearAttention(tabId)
    },

    jumpAttention: () => {
      const queue = needsInputQueue(useRuntime.getState().byTab)
      const next = queue.find((id) => get().state.tabs[id])
      if (next) {
        get().setOverview(false)
        get().jumpToTab(next)
      }
    }
  }
})

// Quit/reload flush: the debounced saves (state 250ms, dock envelopes 250ms)
// would otherwise drop the trailing window of mutations. Envelopes first —
// flushing one applies it to the store, which the blocking save then carries.
window.addEventListener('beforeunload', () => {
  const s = useStore.getState()
  // Never clobber disk state with pre-hydration or load-failure defaults.
  if (!s.hydrated || persistSuppressed) return
  for (const dock of allDocks()) dock.flushPendingEnvelope()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    window.telchar.state.saveSync(useStore.getState().state)
  }
})

// Local tolerant envelope read to avoid a store->adapter type dependency cycle;
// mirrors adapter.referencedTabIds.
function referencedIdsSafe(layout: { dock: { grid: unknown } | null }): string[] {
  const grid = layout.dock?.grid as { panels?: Record<string, unknown> } | undefined
  if (!grid || typeof grid !== 'object' || !grid.panels) return []
  return Object.keys(grid.panels)
}
