// Per-tab status strip under the terminal. Always mounted for terminal tabs
// (constant height, so xterm never reflows when segments come and go) —
// only the content varies: git branch on the left, tool-specific segments on
// the right (Claude is the only one today, gated on runtime.isClaude).

import { GitBranch } from 'lucide-react'
import type { TerminalTab } from '@shared/types'
import { useRuntime } from '../state/runtime'
import { ClaudeSegment } from './claude/ClaudeSegment'

export function TerminalFooter({ tab }: { tab: TerminalTab }) {
  const git = useRuntime((s) => s.git[tab.projectId])
  const isClaude = useRuntime((s) => s.byTab[tab.id]?.isClaude ?? false)

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-panel px-3 text-[11px] text-dim">
      {git?.repo && git.branch && (
        <span className="flex min-w-0 items-center gap-1" title={`Branch: ${git.branch}`}>
          <GitBranch size={11} className="shrink-0" />
          <span className="truncate">{git.branch}</span>
          {(git.ahead ?? 0) > 0 && <span className="shrink-0">↑{git.ahead}</span>}
          {(git.behind ?? 0) > 0 && <span className="shrink-0">↓{git.behind}</span>}
        </span>
      )}
      <span className="min-w-0 flex-1" />
      {isClaude && <ClaudeSegment tab={tab} />}
    </div>
  )
}
