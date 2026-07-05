// Folder management, nothing else: add/remove/rename/recolor project roots.
// Session workflow lives in the Sessions view; plans in the Plans view.

import { useState } from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import { PROJECT_COLORS, type ProjectGroup } from '@shared/types'
import { useStore } from '../../store'
import { useRuntime } from '../../state/runtime'
import { fuzzyScore } from '../../search'
import { Tooltip } from '../ui/Tooltip'
import { FilterInput } from './FilterInput'

export function ProjectsView() {
  const projects = useStore((s) => s.state.projects)
  const addProject = useStore((s) => s.addProject)
  const [query, setQuery] = useState('')
  const visible = projects.filter((p) => fuzzyScore(query, `${p.name} ${p.path}`) > 0)

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold tracking-widest text-dim">PROJECTS</span>
        <Tooltip label="Add project folder" side="bottom">
          <button
            onClick={() => void addProject()}
            className="cursor-pointer rounded p-0.5 text-dim hover:bg-panel hover:text-fg"
          >
            <FolderPlus size={14} />
          </button>
        </Tooltip>
      </div>
      <FilterInput value={query} onChange={setQuery} placeholder="Filter projects…" />
      <div className="flex-1 overflow-y-auto">
        {visible.map((p) => (
          <ProjectRow key={p.id} project={p} />
        ))}
        {query && visible.length === 0 && <div className="px-3 py-2 text-dim">No matches.</div>}
      </div>
    </>
  )
}

function ProjectRow({ project }: { project: ProjectGroup }) {
  const { renameProject, setProjectColor, removeProject } = useStore()
  const git = useRuntime((s) => s.git[project.id])
  const sessionCount = useStore(
    (s) => Object.values(s.state.tabs).filter((t) => t.projectId === project.id && t.kind === 'terminal').length
  )
  const [editing, setEditing] = useState(false)
  const [picker, setPicker] = useState(false)
  const [draft, setDraft] = useState(project.name)

  const commit = () => {
    renameProject(project.id, draft)
    setEditing(false)
  }

  const confirmRemove = () => {
    if (window.confirm(`Remove "${project.name}" and close all of its tabs?`)) {
      removeProject(project.id)
    }
  }

  return (
    <div className="group relative border-b border-border/50 px-3 py-2.5 hover:bg-panel">
      <div className="flex items-center gap-2">
        <button
          className="h-3 w-3 shrink-0 cursor-pointer rounded-full ring-offset-1 ring-offset-bgalt hover:ring-2 hover:ring-fg/40"
          style={{ background: project.color }}
          onClick={() => setPicker((v) => !v)}
          title="Change color"
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(project.name)
                setEditing(false)
              }
            }}
            className="min-w-0 flex-1 rounded border border-border bg-bg px-1 font-semibold text-fg outline-none focus:border-accent"
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-text truncate font-semibold"
            onDoubleClick={() => {
              setDraft(project.name)
              setEditing(true)
            }}
            title="Double-click to rename"
          >
            {project.name}
          </span>
        )}
        <Tooltip label="Remove project" side="left">
          <button
            onClick={confirmRemove}
            className="cursor-pointer rounded p-0.5 text-dim opacity-0 hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </Tooltip>
      </div>
      <div className="flex items-center gap-3 pt-1 pl-5 text-[11px] text-dim">
        <span className="min-w-0 truncate" title={project.path}>
          {project.path.replace(/^\/Users\/[^/]+/, '~')}
        </span>
      </div>
      <div className="flex items-center gap-3 pt-0.5 pl-5 text-[11px] text-dim">
        <span>
          {sessionCount} session{sessionCount === 1 ? '' : 's'}
        </span>
        {git?.repo ? (
          <span>
            ⎇ {git.branch}
            {git.fileTotal > 0 && <span className="text-amber-300/80"> ·{git.fileTotal}</span>}
          </span>
        ) : git ? (
          <span>no git</span>
        ) : null}
      </div>

      {picker && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setPicker(false)} />
          <div className="absolute top-8 left-3 z-20 flex gap-1.5 rounded-lg border border-border bg-panel p-2 shadow-xl">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                className="h-4 w-4 cursor-pointer rounded-full ring-offset-1 ring-offset-panel hover:ring-2 hover:ring-fg/60"
                style={{ background: c, outline: c === project.color ? '2px solid white' : 'none' }}
                onClick={() => {
                  setProjectColor(project.id, c)
                  setPicker(false)
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
