// Claude Code plans (~/.claude/plans), segmented by the selected project.
// Plan files carry no project metadata — the split comes from grepping the
// project's session transcripts (heuristic; see main/watcher.ts). Unmatched
// plans stay reachable under a collapsed "Other plans" section.

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, RefreshCw } from 'lucide-react'
import type { PlanEntry } from '@shared/ipc'
import { useStore, selectedProject } from '../../store'
import { fuzzyScore } from '../../search'
import { Tooltip } from '../ui/Tooltip'
import { FilterInput } from './FilterInput'

export function PlansView() {
  const [plans, setPlans] = useState<PlanEntry[] | null>(null)
  const [refs, setRefs] = useState<Set<string> | null>(null)
  const [othersOpen, setOthersOpen] = useState(false)
  const [query, setQuery] = useState('')
  const openPlan = useStore((s) => s.openPlan)
  const project = useStore((s) => selectedProject(s.state))
  const projectId = project?.id
  const projectPath = project?.path

  const refresh = () => {
    void window.telchar.markdown.listPlans().then(setPlans)
    if (projectPath) {
      void window.telchar.markdown
        .plansForProject(projectPath)
        .then((r) => setRefs(new Set(r)))
        .catch(() => setRefs(new Set()))
    } else {
      setRefs(new Set())
    }
  }
  // Re-fetch when the selected project changes (id, not object identity).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [projectId])

  const loaded = plans !== null && refs !== null
  const visible = loaded ? plans.filter((p) => fuzzyScore(query, p.title) > 0) : []
  const matched = visible.filter((p) => refs!.has(planBasename(p.path)))
  const others = visible.filter((p) => !refs!.has(planBasename(p.path)))
  const filtering = query.length > 0

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="min-w-0 truncate text-[10px] font-semibold tracking-widest text-dim">
          PLANS{project ? ` — ${project.name.toUpperCase()}` : ''}
        </span>
        <Tooltip label="Refresh" side="bottom">
          <button onClick={refresh} className="cursor-pointer rounded p-0.5 text-dim hover:bg-panel hover:text-fg">
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>
      <FilterInput value={query} onChange={setQuery} placeholder="Filter plans…" />
      <div className="flex-1 overflow-y-auto">
        {!loaded && <div className="px-3 py-2 text-dim">Loading…</div>}
        {loaded && (
          <>
            {matched.map((p) => (
              <PlanRow key={p.path} plan={p} onClick={() => project && openPlan(project, p.path, p.title)} />
            ))}
            {matched.length === 0 && !filtering && (
              <div className="px-3 py-2 text-dim">No plans linked to this project yet.</div>
            )}
            {filtering && matched.length === 0 && others.length === 0 && (
              <div className="px-3 py-2 text-dim">No matches.</div>
            )}
            {others.length > 0 && (
              <>
                <button
                  onClick={() => setOthersOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center gap-1 px-3 py-2 text-[10px] font-semibold tracking-widest text-dim hover:bg-panel hover:text-fg"
                >
                  {othersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  OTHER PLANS ({others.length})
                </button>
                {(othersOpen || filtering) &&
                  others.map((p) => (
                    <PlanRow key={p.path} plan={p} onClick={() => project && openPlan(project, p.path, p.title)} />
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function PlanRow({ plan, onClick }: { plan: PlanEntry; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      title={plan.path}
      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-panel"
    >
      <FileText size={12} className="shrink-0 text-dim" />
      <span className="min-w-0 flex-1 truncate">{plan.title}</span>
      <span className="shrink-0 text-[10px] text-dim">{timeAgo(plan.mtimeMs)}</span>
    </div>
  )
}

function planBasename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function timeAgo(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}
