// Claude-specific footer segment (only mounted while the tab's foreground
// process is claude). Session facts arrive via hook events (exact) or the
// newest-transcript heuristic (hooks not installed); see App.tsx + claudeSession.ts.

import { useEffect, useState } from 'react'
import { Sparkles, FileText } from 'lucide-react'
import type { TerminalTab } from '@shared/types'
import { useRuntime } from '../../state/runtime'
import { useStore } from '../../store'
import { Tooltip } from '../ui/Tooltip'

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function refresh(tabId: string, cwd: string): void {
  const session = useRuntime.getState().byTab[tabId]?.claude
  const opts = session?.transcriptPath
    ? { transcriptPath: session.transcriptPath }
    : { projectPath: cwd }
  void window.telchar.claude.sessionInfo(opts).then((info) => {
    useRuntime.getState().setClaudeSession(tabId, info)
    // Heuristic path (hooks not installed): mount/focus refreshes only seed the
    // baseline — never auto-open, or focusing the window would pop a stale plan.
    useStore.getState().surfacePlanForTab(tabId, { seedOnly: true })
  })
}

export function ClaudeSegment({ tab }: { tab: TerminalTab }) {
  const session = useRuntime((s) => s.byTab[tab.id]?.claude)
  const openPlan = useStore((s) => s.openPlan)
  const project = useStore((s) => s.state.projects.find((p) => p.id === tab.projectId))
  const [busy, setBusy] = useState(false)

  // Resolve once on mount (covers the hooks-not-installed fallback) and
  // compensate staleness on window focus — no polling.
  useEffect(() => {
    refresh(tab.id, tab.cwd)
    const onFocus = () => refresh(tab.id, tab.cwd)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [tab.id, tab.cwd])

  const exact = Boolean(session?.transcriptPath)
  const tooltip = session?.sessionId
    ? `Claude session ${session.sessionId.slice(0, 8)}`
    : exact
      ? 'Claude session'
      : 'Claude session (nearest match — install hooks for exact tracking)'

  // The button is ALWAYS shown while claude runs. It resolves the plan on click
  // (rather than depending on background resolution having populated planPath),
  // then opens the live markdown preview as a split — the reliable manual path.
  async function viewPlan(): Promise<void> {
    if (!project || busy) return
    setBusy(true)
    try {
      let planPath = session?.planPath
      let planTitle = session?.planTitle
      if (!planPath) {
        const opts = session?.transcriptPath
          ? { transcriptPath: session.transcriptPath }
          : { projectPath: tab.cwd }
        const info = await window.telchar.claude.sessionInfo(opts)
        useRuntime.getState().setClaudeSession(tab.id, info)
        planPath = info.planPath
        planTitle = info.planTitle
      }
      if (planPath) {
        openPlan(project, planPath, planTitle ?? 'Plan', 'right')
      } else {
        try {
          new Notification('Telchar', { body: 'No plan found for this Claude session yet.' })
        } catch {
          /* notifications unavailable */
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      <Tooltip label={tooltip} side="top">
        <span className="flex items-center gap-1">
          <Sparkles size={11} className="text-accent" />
          {session?.contextTokens !== undefined && <span>{formatTokens(session.contextTokens)}</span>}
        </span>
      </Tooltip>
      {project && (
        <button
          onClick={() => void viewPlan()}
          disabled={busy}
          title="Open this session's plan as a live markdown preview (split)"
          className="flex cursor-pointer items-center gap-1 text-accent hover:underline disabled:opacity-50"
        >
          <FileText size={11} /> View plan
        </button>
      )}
    </span>
  )
}
