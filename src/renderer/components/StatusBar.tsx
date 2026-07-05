// Bottom status bar: selected project context (dot, name, git branch)
// + global session counts. Click counts to jump.

import { useStore, selectedProject } from '../store'
import { useRuntime, needsInputQueue } from '../state/runtime'
import { Certh8 } from './brand/CirthMark'

export function StatusBar() {
  const project = useStore((s) => selectedProject(s.state))
  const jumpAttention = useStore((s) => s.jumpAttention)
  const setSidebar = useStore((s) => s.setSidebar)
  const git = useRuntime((s) => (project ? s.git[project.id] : undefined))
  const counts = useRuntime((s) => {
    let busy = 0
    for (const r of Object.values(s.byTab)) if (r.attention === 'busy') busy++
    return { busy, needsInput: needsInputQueue(s.byTab).length }
  })
  const sessionCount = useStore(
    (s) => Object.values(s.state.tabs).filter((t) => t.kind === 'terminal').length
  )

  return (
    <div className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-bgalt px-3.5 text-[11px] text-dim">
      <span title="Telchar — One forge. Many sessions." className="flex items-center text-ember/70">
        <Certh8 className="h-3.5 w-auto" />
      </span>
      {project && (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: project.color }} />
          {project.name}
        </span>
      )}
      {git?.repo && (
        <button
          onClick={() => setSidebar({ view: 'git', collapsed: false })}
          className="flex cursor-pointer items-center gap-1.5 hover:text-fg"
          title="Open git view"
        >
          <span>⎇ {git.branch}</span>
          {(git.ahead ?? 0) > 0 && <span className="text-accent">↑{git.ahead}</span>}
          {(git.behind ?? 0) > 0 && <span className="text-amber-400">↓{git.behind}</span>}
          {git.fileTotal > 0 && <span className="text-amber-300/80">●{git.fileTotal}</span>}
        </button>
      )}
      <span className="flex-1" />
      <span>{sessionCount} session{sessionCount === 1 ? '' : 's'}</span>
      {counts.busy > 0 && (
        <span className="flex items-center gap-1 text-accent">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> {counts.busy} busy
        </span>
      )}
      {counts.needsInput > 0 && (
        <button
          onClick={jumpAttention}
          className="flex cursor-pointer items-center gap-1 font-semibold text-amber-400 hover:underline"
          title="Jump to oldest needs-input session (⌘⇧A)"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400" /> {counts.needsInput} needs input
        </button>
      )}
    </div>
  )
}
