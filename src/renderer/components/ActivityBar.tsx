// Far-left icon strip — switches the sidebar view (VSCode activity bar).
// Clicking the active icon toggles the sidebar collapsed.

import { Keyboard, Settings } from 'lucide-react'
import type { SidebarView } from '@shared/types'
import { useStore } from '../store'
import { useRuntime, needsInputQueue } from '../state/runtime'
import { Tooltip } from './ui/Tooltip'
import {
  RuneTerminal,
  RunePlan,
  RuneFiles,
  RuneGit,
  RuneFolder,
  RuneSearch
} from './brand/RuneIcons'

// Projects (folder management) sits last-but-one, above Search — it's an
// occasional-use view, not part of the daily-driver cluster.
// Icons are the custom runic set (cirth stroke language), not lucide —
// concept silhouettes stay, the voice is Telchar's (see BRAND.md).
const VIEWS: { view: SidebarView; icon: typeof RuneTerminal; label: string }[] = [
  { view: 'sessions', icon: RuneTerminal, label: 'Sessions' },
  { view: 'plans', icon: RunePlan, label: 'Plans' },
  { view: 'files', icon: RuneFiles, label: 'Files' },
  { view: 'git', icon: RuneGit, label: 'Git' },
  { view: 'projects', icon: RuneFolder, label: 'Projects' },
  { view: 'search', icon: RuneSearch, label: 'Search' }
]

export function ActivityBar() {
  const sidebar = useStore((s) => s.state.sidebar)
  const setSidebar = useStore((s) => s.setSidebar)
  const attentionCount = useRuntime((s) => needsInputQueue(s.byTab).length)
  const dirtyTotal = useRuntime((s) =>
    Object.values(s.git).reduce((n, g) => n + (g.repo ? g.fileTotal : 0), 0)
  )

  const select = (view: SidebarView) => {
    if (sidebar.view === view && !sidebar.collapsed) setSidebar({ collapsed: true })
    else setSidebar({ view, collapsed: false })
  }

  return (
    <div className="flex w-[52px] shrink-0 flex-col items-center gap-1.5 pt-2.5">
      {VIEWS.map(({ view, icon: Icon, label }) => {
        const active = sidebar.view === view && !sidebar.collapsed
        return (
          <Tooltip key={view} label={label} side="right">
            <button
              onClick={() => select(view)}
              className={
                'relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg ' +
                (active
                  ? 'bg-panel text-fg shadow-[inset_2.5px_0_0_var(--color-ember)]'
                  : 'text-dim hover:bg-panel hover:text-fg')
              }
            >
              <Icon size={24} strokeWidth={1.5} />
              {view === 'sessions' && attentionCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black">
                  {attentionCount}
                </span>
              )}
              {view === 'git' && dirtyTotal > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-panelhi px-0.5 text-[9px] font-bold text-fg">
                  {dirtyTotal > 99 ? '99+' : dirtyTotal}
                </span>
              )}
            </button>
          </Tooltip>
        )
      })}
      <span className="flex-1" />
      <Tooltip label="Settings" side="right">
        <button
          onClick={() => useStore.getState().setSettings(true)}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg text-dim hover:bg-panel hover:text-fg"
        >
          <Settings size={24} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <Tooltip label="Keyboard shortcuts — ⌘/" side="right">
        <button
          onClick={() => useStore.getState().setKeybinds(true)}
          className="mb-2 flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg text-dim hover:bg-panel hover:text-fg"
        >
          <Keyboard size={24} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  )
}
