// Sidebar search: same engine as ⌘P, persistent panel form.

import { useState } from 'react'
import { FileText, TerminalSquare } from 'lucide-react'
import { useStore, selectedProject } from '../../store'
import { useSearchHits } from '../../search'
import { AttentionDot } from '../AttentionDot'

export function SearchView() {
  const [query, setQuery] = useState('')
  const projectId = useStore((s) => selectedProject(s.state)?.id)
  const hits = useSearchHits(query, true, 100, projectId)
  const { jumpToTab, openFile } = useStore()

  return (
    <>
      <div className="px-3 py-2 text-[10px] font-semibold tracking-widest text-dim">SEARCH</div>
      <div className="px-2 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sessions + files… (⌘P)"
          className="w-full rounded border border-border bg-bg px-2.5 py-2 text-fg outline-none placeholder:text-dim focus:border-accent"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {query &&
          hits.map((hit) =>
            hit.kind === 'session' ? (
              <div
                key={`s:${hit.tab.id}`}
                onClick={() => jumpToTab(hit.tab.id)}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-panel"
              >
                <TerminalSquare size={12} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                <AttentionDot tabId={hit.tab.id} kind={hit.tab.kind} />
              </div>
            ) : (
              <div
                key={`f:${hit.absPath}`}
                onClick={() => openFile(hit.project, hit.absPath, hit.relPath.split('/').pop() ?? hit.relPath)}
                title={hit.absPath}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-panel"
              >
                <FileText size={12} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-dim">{hit.project.name}/</span>
                  {hit.relPath}
                </span>
              </div>
            )
          )}
        {query && hits.length === 0 && <div className="px-3 py-2 text-dim">No matches.</div>}
      </div>
    </>
  )
}
