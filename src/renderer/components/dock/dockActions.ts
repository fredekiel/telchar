// Imperative bridge between the store/shortcuts and each layout's dockview
// instance. Geometry operations (split/focus/move) are dockview's job; the
// store only owns tab metadata. DockHost registers its actions on mount.

import type { PersistedTab } from '@shared/types'

export type SplitDirection = 'right' | 'below'

export interface DockActions {
  addTabPanel(tab: PersistedTab, split?: SplitDirection): void
  removeTabPanel(tabId: string): void
  focusTab(tabId: string): void
  focusPane(index: number): void
  focusPaneDelta(delta: number): void
  cycleTab(delta: number): void
  toggleMaximize(): void
  panelIds(): string[]
  // Fire the pending debounced envelope save now (beforeunload flush).
  flushPendingEnvelope(): void
}

const registry = new Map<string, DockActions>()

export function registerDock(layoutId: string, actions: DockActions | null): void {
  if (actions) registry.set(layoutId, actions)
  else registry.delete(layoutId)
}

export function dockFor(layoutId: string): DockActions | undefined {
  return registry.get(layoutId)
}

export function allDocks(): DockActions[] {
  return [...registry.values()]
}
