// The ONLY module (besides DockHost) that understands dockview's serialized
// shape. Everything else treats the grid as an opaque DockGridEnvelope.
// If the lib or its major version changes, fromEnvelope refuses and the host
// rebuilds a default grid from the tabs map — geometry lost, tabs never.

import type { DockviewApi, SerializedDockview } from 'dockview-react'
import type { DockGridEnvelope, PersistedTab } from '@shared/types'
import type { SplitDirection } from './dockActions'

export const DOCK_LIB = 'dockview'
// Keep in sync with package.json — gates envelope reuse across major versions.
export const DOCK_LIB_VERSION = '7.0.2'

const PANEL_COMPONENT = 'tabBody'
const TAB_COMPONENT = 'tabHeader'

function major(v: string): string {
  return v.split('.')[0] ?? ''
}

export function toEnvelope(api: DockviewApi): DockGridEnvelope {
  return { lib: DOCK_LIB, libVersion: DOCK_LIB_VERSION, grid: api.toJSON() }
}

// Tolerant read of panel ids out of a serialized grid (panel id === tabId).
export function referencedTabIds(env: DockGridEnvelope | null): string[] {
  if (!env || env.lib !== DOCK_LIB) return []
  const grid = env.grid as { panels?: Record<string, unknown> } | null
  if (!grid || typeof grid !== 'object' || !grid.panels || typeof grid.panels !== 'object') return []
  return Object.keys(grid.panels)
}

// Restore a serialized grid. Returns false when incompatible/corrupt — caller
// falls back to buildDefaultGrid. Panels referencing unknown tabs are stripped
// afterwards (tabs map is the authority).
export function fromEnvelope(api: DockviewApi, env: DockGridEnvelope, knownTabIds: Set<string>): boolean {
  if (env.lib !== DOCK_LIB || major(env.libVersion) !== major(DOCK_LIB_VERSION)) return false
  try {
    api.fromJSON(env.grid as SerializedDockview)
  } catch {
    try {
      api.clear()
    } catch {
      /* ignore */
    }
    return false
  }
  for (const panel of [...api.panels]) {
    if (!knownTabIds.has(panel.id)) api.removePanel(panel)
  }
  return true
}

export function addTabPanel(api: DockviewApi, tab: PersistedTab, split?: SplitDirection): void {
  if (api.getPanel(tab.id)) return
  api.addPanel({
    id: tab.id,
    component: PANEL_COMPONENT,
    tabComponent: TAB_COMPONENT,
    title: tab.title,
    renderer: 'always', // xterm DOM must survive tab switches
    params: { tabId: tab.id },
    position: split
      ? { referenceGroup: api.activeGroup ?? undefined, direction: split === 'right' ? 'right' : 'below' }
      : api.activeGroup
        ? { referenceGroup: api.activeGroup, direction: 'within' }
        : undefined
  })
}

// One group, all tabs as stacked panels — migration/default/recovery path.
export function buildDefaultGrid(api: DockviewApi, tabs: PersistedTab[]): void {
  try {
    api.clear()
  } catch {
    /* empty already */
  }
  for (const tab of tabs) addTabPanel(api, tab)
}
