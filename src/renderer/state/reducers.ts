// Pure layout logic — no electron, no React, no dockview. Unit-testable.
// The tabs map is the authority on what exists; dock grids (opaque envelopes)
// are geometry projections maintained by the dock adapter/host.

import type {
  DockGridEnvelope,
  Layout,
  PersistedState,
  PersistedTab,
  ProjectGroup,
  SidebarState,
  ThemeMode,
  PlanPreviewMode
} from '@shared/types'

// ---- projects ----

export function addProject(state: PersistedState, project: ProjectGroup): PersistedState {
  if (state.projects.some((p) => p.path === project.path)) return state
  const projects = [...state.projects, project]
  // Auto-select when nothing valid is selected (covers the zero→first project
  // case for every add path: combobox, palette, Projects view, empty takeover).
  const stale = !projects.some((p) => p.id === state.sidebar.selectedProjectId)
  return {
    ...state,
    projects,
    sidebar: stale ? { ...state.sidebar, selectedProjectId: project.id } : state.sidebar
  }
}

// Manual project selection — the only way selection changes (no auto-follow).
export function selectProject(state: PersistedState, projectId: string): PersistedState {
  if (!state.projects.some((p) => p.id === projectId)) return state
  if (state.sidebar.selectedProjectId === projectId) return state
  return { ...state, sidebar: { ...state.sidebar, selectedProjectId: projectId } }
}

export function toggleCollapsed(state: PersistedState, projectId: string): PersistedState {
  return {
    ...state,
    projects: state.projects.map((p) =>
      p.id === projectId ? { ...p, collapsed: !p.collapsed } : p
    )
  }
}

export function renameProject(state: PersistedState, projectId: string, name: string): PersistedState {
  const trimmed = name.trim()
  if (!trimmed) return state
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p))
  }
}

export function setProjectColor(state: PersistedState, projectId: string, color: string): PersistedState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === projectId ? { ...p, color } : p))
  }
}

// Removing a project drops it and all of its tabs (grid panels are stripped by
// the dock host's reconcile pass; pty kill happens in the store action).
export function removeProject(state: PersistedState, projectId: string): PersistedState {
  const tabs: Record<string, PersistedTab> = {}
  for (const [id, tab] of Object.entries(state.tabs)) {
    if (tab.projectId !== projectId) tabs[id] = tab
  }
  const projects = state.projects.filter((p) => p.id !== projectId)
  let sidebar = state.sidebar
  // Selection must never dangle: reassign to a survivor, or clear when none left.
  if (state.sidebar.selectedProjectId === projectId) {
    sidebar = { ...state.sidebar, selectedProjectId: projects[0]?.id }
  }
  return {
    ...state,
    projects,
    tabs,
    sidebar,
    layouts: state.layouts.map((l) =>
      l.activeTabId && !tabs[l.activeTabId] ? { ...l, activeTabId: null } : l
    )
  }
}

// ---- tabs ----

export function addTab(state: PersistedState, layoutId: string, tab: PersistedTab): PersistedState {
  return {
    ...state,
    tabs: { ...state.tabs, [tab.id]: tab },
    layouts: state.layouts.map((l) => (l.id === layoutId ? { ...l, activeTabId: tab.id } : l))
  }
}

export function closeTab(state: PersistedState, tabId: string): PersistedState {
  if (!state.tabs[tabId]) return state
  const tabs = { ...state.tabs }
  delete tabs[tabId]
  return {
    ...state,
    tabs,
    layouts: state.layouts.map((l) =>
      l.activeTabId === tabId ? { ...l, activeTabId: null } : l
    )
  }
}

export function setActiveTab(state: PersistedState, layoutId: string, tabId: string | null): PersistedState {
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === layoutId ? { ...l, activeTabId: tabId } : l))
  }
}

export function setTabClaudeFlag(state: PersistedState, tabId: string, isClaude: boolean): PersistedState {
  const tab = state.tabs[tabId]
  if (!tab || tab.kind !== 'terminal' || (tab.wasRunningClaude ?? false) === isClaude) return state
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, wasRunningClaude: isClaude } } }
}

export function renameTab(state: PersistedState, tabId: string, title: string): PersistedState {
  const tab = state.tabs[tabId]
  const trimmed = title.trim()
  if (!tab || !trimmed) return state
  const next = { ...tab, title: trimmed }
  // Manual rename pins the title above live OSC titles (terminals only).
  if (next.kind === 'terminal') next.titlePinned = true
  return { ...state, tabs: { ...state.tabs, [tabId]: next } }
}

// Setting undefined clears the key (persisted JSON stays free of null noise).
function withDecor<T extends PersistedTab | Layout>(
  item: T,
  field: 'color' | 'icon',
  value: string | undefined
): T {
  const next = { ...item }
  if (value === undefined) delete next[field]
  else next[field] = value
  return next
}

export function setTabColor(state: PersistedState, tabId: string, color: string | undefined): PersistedState {
  const tab = state.tabs[tabId]
  if (!tab || tab.color === color) return state
  return { ...state, tabs: { ...state.tabs, [tabId]: withDecor(tab, 'color', color) } }
}

export function setTabIcon(state: PersistedState, tabId: string, icon: string | undefined): PersistedState {
  const tab = state.tabs[tabId]
  if (!tab || tab.icon === icon) return state
  return { ...state, tabs: { ...state.tabs, [tabId]: withDecor(tab, 'icon', icon) } }
}

// Unpin a manual rename so live OSC titles take over again (terminals only).
export function unpinTabTitle(state: PersistedState, tabId: string): PersistedState {
  const tab = state.tabs[tabId]
  if (!tab || tab.kind !== 'terminal' || !tab.titlePinned) return state
  return { ...state, tabs: { ...state.tabs, [tabId]: { ...tab, titlePinned: false } } }
}

// ---- layouts ----

export function createLayout(state: PersistedState, id: string, name: string): PersistedState {
  const layout: Layout = { id, name, dock: null, activeTabId: null }
  return { ...state, layouts: [...state.layouts, layout], activeLayoutId: id }
}

export function renameLayout(state: PersistedState, layoutId: string, name: string): PersistedState {
  const trimmed = name.trim()
  if (!trimmed) return state
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === layoutId ? { ...l, name: trimmed } : l))
  }
}

export function setLayoutColor(state: PersistedState, layoutId: string, color: string | undefined): PersistedState {
  const layout = state.layouts.find((l) => l.id === layoutId)
  if (!layout || layout.color === color) return state
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === layoutId ? withDecor(l, 'color', color) : l))
  }
}

export function setLayoutIcon(state: PersistedState, layoutId: string, icon: string | undefined): PersistedState {
  const layout = state.layouts.find((l) => l.id === layoutId)
  if (!layout || layout.icon === icon) return state
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === layoutId ? withDecor(l, 'icon', icon) : l))
  }
}

// Deleting a layout drops the tabs it owns (callers pass the owned tab ids,
// derived from the dock envelope — reducers stay envelope-agnostic).
export function deleteLayout(state: PersistedState, layoutId: string, ownedTabIds: string[]): PersistedState {
  if (state.layouts.length <= 1) return state
  const layouts = state.layouts.filter((l) => l.id !== layoutId)
  const tabs = { ...state.tabs }
  for (const id of ownedTabIds) delete tabs[id]
  const activeLayoutId =
    state.activeLayoutId === layoutId ? layouts[layouts.length - 1].id : state.activeLayoutId
  return { ...state, layouts, tabs, activeLayoutId }
}

export function setActiveLayout(state: PersistedState, layoutId: string): PersistedState {
  if (!state.layouts.some((l) => l.id === layoutId)) return state
  return { ...state, activeLayoutId: layoutId }
}

export function setDockEnvelope(
  state: PersistedState,
  layoutId: string,
  dock: DockGridEnvelope
): PersistedState {
  return {
    ...state,
    layouts: state.layouts.map((l) => (l.id === layoutId ? { ...l, dock } : l))
  }
}

// Drop tab metadata not referenced by any layout (called at hydrate with the
// union of all envelopes' referenced ids + pending placements).
export function gcOrphanTabs(state: PersistedState, referenced: Set<string>): PersistedState {
  const orphans = Object.keys(state.tabs).filter((id) => !referenced.has(id))
  if (orphans.length === 0) return state
  const tabs = { ...state.tabs }
  for (const id of orphans) delete tabs[id]
  return { ...state, tabs }
}

// ---- sidebar ----

export function setSidebar(state: PersistedState, patch: Partial<SidebarState>): PersistedState {
  return { ...state, sidebar: { ...state.sidebar, ...patch } }
}

// ---- theme ----

export function setTheme(state: PersistedState, theme: ThemeMode): PersistedState {
  if (state.theme === theme) return state
  return { ...state, theme }
}

export function setPlanPreview(state: PersistedState, planPreview: PlanPreviewMode): PersistedState {
  if (state.planPreview === planPreview) return state
  return { ...state, planPreview }
}

// ---- helpers ----

export function tabsForProject(state: PersistedState, projectId: string): PersistedTab[] {
  return Object.values(state.tabs).filter((t) => t.projectId === projectId)
}

export function activeLayout(state: PersistedState): Layout {
  return state.layouts.find((l) => l.id === state.activeLayoutId) ?? state.layouts[0]
}

export function activeTab(state: PersistedState): PersistedTab | undefined {
  const layout = activeLayout(state)
  return layout.activeTabId ? state.tabs[layout.activeTabId] : undefined
}
