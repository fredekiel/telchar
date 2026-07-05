// Per-tab attention glyph: busy pulse / amber needs-input / gray idle /
// red exited. Terminal tabs only — plan/file tabs have no runtime state.

import type { TabKind } from '@shared/types'
import { useRuntime } from '../state/runtime'

export function AttentionDot({ tabId, kind }: { tabId: string; kind: TabKind }) {
  const attention = useRuntime((s) => s.byTab[tabId]?.attention ?? 'idle')
  if (kind !== 'terminal') return null

  switch (attention) {
    case 'busy':
      return <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" title="Working" />
    case 'needs-input':
      return <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Needs input" />
    case 'exited':
      return <span className="shrink-0 text-[10px] leading-none text-red-400" title="Exited">×</span>
    default:
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dim/40" title="Idle" />
  }
}
