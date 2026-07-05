// Runtime-only state: never enters state:save (separate store from the
// persisted one on purpose). Fed by pty:status pushes, xterm bell/title
// events and (later) claude hook events.

import { create } from 'zustand'
import type { AttentionState, RuntimeStatus } from '@shared/types'
import type { GitProjectStatus, PtyStatusMessage } from '@shared/ipc'

// Claude session facts for the terminal footer. sessionId/transcriptPath come
// from hook event payloads; plan/tokens from the claude:sessionInfo resolver.
export interface TabClaudeSession {
  sessionId?: string
  transcriptPath?: string
  planPath?: string
  planTitle?: string
  contextTokens?: number
}

export interface TabRuntime {
  status: RuntimeStatus
  exitCode?: number
  fgProcess?: string
  isClaude: boolean
  attention: AttentionState
  oscTitle?: string
  // Timestamp of when needs-input was raised (drives oldest-first jump queue).
  attentionSince?: number
  claude?: TabClaudeSession
  // Plan path already auto-surfaced for this tab — so a plan opens once and a
  // closed preview is never reopened (see store.surfacePlanForTab).
  surfacedPlan?: string
}

// Tolerant extraction of the two hook stdin fields we use. The payload is
// whatever the hook curl'd — arbitrary JSON, so typeof-check every field.
export function pickClaudeSessionFields(payload: unknown): TabClaudeSession | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  const sessionId = typeof p.session_id === 'string' ? p.session_id : undefined
  const transcriptPath = typeof p.transcript_path === 'string' ? p.transcript_path : undefined
  if (!sessionId && !transcriptPath) return null
  return { sessionId, transcriptPath }
}

const DEFAULT_RUNTIME: TabRuntime = { status: 'connecting', isClaude: false, attention: 'idle' }

interface RuntimeStore {
  byTab: Record<string, TabRuntime>
  // tabId -> layoutId, rebuilt by the dock hosts from envelope contents.
  tabLayout: Record<string, string>
  // projectId -> latest git status push (runtime only).
  git: Record<string, GitProjectStatus>
  // Resolved theme (persisted pref + OS when 'system'). Set by useThemeController.
  effectiveTheme: 'dark' | 'light'
  setEffectiveTheme(theme: 'dark' | 'light'): void
  applyStatus(msg: PtyStatusMessage): void
  applyGit(status: GitProjectStatus): void
  removeGit(projectId: string): void
  bell(tabId: string): void
  setOscTitle(tabId: string, title: string): void
  setClaudeSession(tabId: string, patch: TabClaudeSession): void
  setSurfacedPlan(tabId: string, planPath: string): void
  markBusy(tabId: string): void
  markNeedsInput(tabId: string): void
  clearAttention(tabId: string): void
  setTabLayout(layoutId: string, tabIds: string[]): void
  remove(tabId: string): void
}

function patch(
  byTab: Record<string, TabRuntime>,
  tabId: string,
  p: Partial<TabRuntime>
): Record<string, TabRuntime> {
  return { ...byTab, [tabId]: { ...(byTab[tabId] ?? DEFAULT_RUNTIME), ...p } }
}

export const useRuntime = create<RuntimeStore>((set) => ({
  byTab: {},
  tabLayout: {},
  git: {},
  // Matches the CSS default (dark tokens) so first paint never flashes.
  effectiveTheme: 'dark',

  setEffectiveTheme: (effectiveTheme) => set({ effectiveTheme }),

  applyGit: (status) => set((s) => ({ git: { ...s.git, [status.projectId]: status } })),

  removeGit: (projectId) =>
    set((s) => {
      const git = { ...s.git }
      delete git[projectId]
      return { git }
    }),

  applyStatus: (msg) =>
    set((s) => {
      const p: Partial<TabRuntime> = { status: msg.status }
      if (msg.exitCode !== undefined) p.exitCode = msg.exitCode
      if (msg.status === 'exited') p.attention = 'exited'
      if (msg.fgProcess !== undefined) {
        p.fgProcess = msg.fgProcess
        p.isClaude = msg.isClaude ?? false
      }
      return { byTab: patch(s.byTab, msg.tabId, p) }
    }),

  bell: (tabId) =>
    set((s) => ({
      byTab: patch(s.byTab, tabId, { attention: 'needs-input', attentionSince: Date.now() })
    })),

  setOscTitle: (tabId, title) => set((s) => ({ byTab: patch(s.byTab, tabId, { oscTitle: title }) })),

  setClaudeSession: (tabId, p) =>
    set((s) => ({
      byTab: patch(s.byTab, tabId, {
        claude: { ...(s.byTab[tabId]?.claude ?? {}), ...p }
      })
    })),

  setSurfacedPlan: (tabId, planPath) =>
    set((s) => ({ byTab: patch(s.byTab, tabId, { surfacedPlan: planPath }) })),

  markBusy: (tabId) =>
    set((s) => {
      const cur = s.byTab[tabId]
      // needs-input outranks busy until the user acts on it.
      if (cur?.attention === 'needs-input' || cur?.attention === 'exited') return s
      return { byTab: patch(s.byTab, tabId, { attention: 'busy' }) }
    }),

  markNeedsInput: (tabId) =>
    set((s) => ({
      byTab: patch(s.byTab, tabId, { attention: 'needs-input', attentionSince: Date.now() })
    })),

  clearAttention: (tabId) =>
    set((s) => {
      const cur = s.byTab[tabId]
      if (!cur || cur.attention === 'idle' || cur.attention === 'exited') return s
      return { byTab: patch(s.byTab, tabId, { attention: 'idle', attentionSince: undefined }) }
    }),

  setTabLayout: (layoutId, tabIds) =>
    set((s) => {
      const tabLayout = { ...s.tabLayout }
      // Drop stale entries for this layout, then re-add current ones.
      for (const [tabId, l] of Object.entries(tabLayout)) {
        if (l === layoutId && !tabIds.includes(tabId)) delete tabLayout[tabId]
      }
      for (const id of tabIds) tabLayout[id] = layoutId
      return { tabLayout }
    }),

  remove: (tabId) =>
    set((s) => {
      const byTab = { ...s.byTab }
      const tabLayout = { ...s.tabLayout }
      delete byTab[tabId]
      delete tabLayout[tabId]
      return { byTab, tabLayout }
    })
}))

// Oldest needs-input session first (cross-layout jump queue).
export function needsInputQueue(byTab: Record<string, TabRuntime>): string[] {
  return Object.entries(byTab)
    .filter(([, r]) => r.attention === 'needs-input')
    .sort((a, b) => (a[1].attentionSince ?? 0) - (b[1].attentionSince ?? 0))
    .map(([id]) => id)
}
