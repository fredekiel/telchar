// The daily driver: the selected project's sessions, attention-first.
// (Project selection lives in SidebarPanel's ScopeRow combobox.)

import { useState } from 'react'
import { Plus, TerminalSquare, FileText } from 'lucide-react'
import type { PersistedTab } from '@shared/types'
import { useStore, selectedProject } from '../../store'
import { useRuntime } from '../../state/runtime'
import { tabsForProject } from '../../state/reducers'
import { fuzzyScore } from '../../search'
import { AttentionDot } from '../AttentionDot'
import { DecorIcon } from '../DecorIcon'
import { FilterInput } from './FilterInput'

// Same label SessionRow displays: live OSC title unless the user pinned a rename.
function sessionLabel(tab: PersistedTab, oscTitle: string | undefined): string {
  const pinned = tab.kind === 'terminal' && tab.titlePinned
  return ((!pinned && tab.kind === 'terminal' && oscTitle) || tab.title) ?? ''
}

export function SessionsView() {
  const state = useStore((s) => s.state)
  const { newTerminal, jumpToTab, toggleCollapsed } = useStore()
  const byTab = useRuntime((s) => s.byTab)
  const [query, setQuery] = useState('')
  const filtering = query.length > 0
  const project = selectedProject(state)
  const projects = project ? [project] : []

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-1">
      <FilterInput value={query} onChange={setQuery} placeholder="Filter sessions…" />
      <div className="flex-1 overflow-y-auto">
      {projects.map((project) => {
        const tabs = tabsForProject(state, project.id).filter(
          (tab) => fuzzyScore(query, sessionLabel(tab, byTab[tab.id]?.oscTitle)) > 0
        )
        return (
          <div key={project.id} className="select-none">
            <div
              onClick={() => toggleCollapsed(project.id)}
              className="flex cursor-pointer items-center gap-1.5 px-3 py-1.5 hover:bg-panel"
            >
              <span className="w-2.5 text-[9px] text-dim">{project.collapsed ? '▸' : '▾'}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-dim uppercase">
                {project.name}
              </span>
              <span className="text-[10px] text-dim">{tabs.length}</span>
            </div>
            {(!project.collapsed || filtering) && (
              <div className="pb-1">
                {tabs.map((tab) => (
                  <SessionRow key={tab.id} tabId={tab.id} onClick={() => jumpToTab(tab.id)} />
                ))}
                {filtering && tabs.length === 0 && <div className="py-1.5 pl-8 text-dim">No matches.</div>}
                {!filtering && (
                  <button
                    onClick={() => newTerminal(project)}
                    className="flex w-full cursor-pointer items-center gap-2 py-1.5 pr-3 pl-8 text-left text-dim hover:bg-panel hover:text-fg"
                  >
                    <Plus size={12} /> new terminal
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}

function SessionRow({ tabId, onClick }: { tabId: string; onClick: () => void }) {
  const tab = useStore((s) => s.state.tabs[tabId])
  const activeTabId = useStore((s) => {
    const l = s.state.layouts.find((x) => x.id === s.state.activeLayoutId)
    return l?.activeTabId
  })
  const layoutName = useStore((s) => {
    const layoutId = useRuntime.getState().tabLayout[tabId]
    return s.state.layouts.length > 1 ? s.state.layouts.find((l) => l.id === layoutId)?.name : undefined
  })
  const runtime = useRuntime((s) => s.byTab[tabId])
  if (!tab || tab.kind === 'empty') return null
  const pinned = tab.kind === 'terminal' && tab.titlePinned
  const label = (!pinned && tab.kind === 'terminal' && runtime?.oscTitle) || tab.title

  // Tab tint follows the tab into the sidebar (wayfinding, not decoration).
  // Active-row stripe is ember: selection identity (three-hue rule, BRAND.md).
  const surface = tab.color
    ? tab.id === activeTabId
      ? 'bg-[color-mix(in_srgb,var(--tab-color)_18%,var(--color-panel))] text-fg shadow-[inset_2px_0_0_var(--color-ember)]'
      : 'text-fg bg-[color-mix(in_srgb,var(--tab-color)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--tab-color)_18%,var(--color-panel))]'
    : tab.id === activeTabId
      ? 'bg-panel text-fg shadow-[inset_2px_0_0_var(--color-ember)]'
      : 'text-fg hover:bg-panel'

  return (
    <div
      onClick={onClick}
      title={tab.kind === 'terminal' ? tab.cwd : 'path' in tab ? tab.path : undefined}
      style={{ '--tab-color': tab.color } as React.CSSProperties}
      className={'flex cursor-pointer items-center gap-2 py-1.5 pr-3 pl-8 ' + surface}
    >
      <span className="flex w-3 justify-center text-dim">
        {tab.icon ? (
          <DecorIcon icon={tab.icon} color={tab.color} size={12} />
        ) : tab.kind === 'terminal' ? (
          <TerminalSquare size={12} />
        ) : (
          <FileText size={12} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {layoutName && <span className="shrink-0 rounded bg-panel px-1 text-[9px] text-dim">{layoutName}</span>}
      <AttentionDot tabId={tab.id} kind={tab.kind} />
    </div>
  )
}
