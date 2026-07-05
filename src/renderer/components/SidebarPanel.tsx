// Resizable sidebar hosting the view selected in the activity bar.
// Width persists; drag the right edge to resize.

import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { SessionsView } from './sidebar/SessionsView'
import { ProjectsView } from './sidebar/ProjectsView'
import { PlansView } from './sidebar/PlansView'
import { FilesView } from './sidebar/FilesView'
import { GitView } from './sidebar/GitView'
import { SearchView } from './sidebar/SearchView'
import { ProjectCombobox } from './ProjectCombobox'

const MIN_W = 140
const MAX_W = 600

// Sticky selector row: the project combobox shared by every sidebar view.
// The selected project scopes Sessions/Git/Files/Search.
function ScopeRow() {
  return (
    <div className="flex items-center border-b border-border px-3 py-3">
      <ProjectCombobox />
    </div>
  )
}

export function SidebarPanel() {
  const sidebar = useStore((s) => s.state.sidebar)
  const setSidebar = useStore((s) => s.setSidebar)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = { startX: e.clientX, startW: sidebar.width }
      e.preventDefault()
    },
    [sidebar.width]
  )

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragRef.current) return
      const w = Math.min(MAX_W, Math.max(MIN_W, dragRef.current.startW + e.clientX - dragRef.current.startX))
      setSidebar({ width: w })
    }
    const up = () => {
      dragRef.current = null
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [setSidebar])

  if (sidebar.collapsed) return null

  return (
    <div
      className="relative flex shrink-0 flex-col border-l border-border"
      style={{ width: sidebar.width }}
    >
      <ScopeRow />
      {sidebar.view === 'sessions' && <SessionsView />}
      {sidebar.view === 'projects' && <ProjectsView />}
      {sidebar.view === 'plans' && <PlansView />}
      {sidebar.view === 'files' && <FilesView />}
      {sidebar.view === 'git' && <GitView />}
      {sidebar.view === 'search' && <SearchView />}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 -right-0.5 z-10 h-full w-1 cursor-col-resize hover:bg-accent/40"
      />
    </div>
  )
}
