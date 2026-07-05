// Selected project's git view: topbar "Git" ellipsis menu (push/pull/fetch/
// stash/refresh/discard), branch + ahead/behind, changed files with VSCode
// decoration colors, and a commit textarea + button shown only when dirty.

import { useEffect, useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  GitBranch,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { GitFileEntry } from '@shared/ipc'
import type { ProjectGroup } from '@shared/types'
import { useStore, selectedProject } from '../../store'
import { useRuntime } from '../../state/runtime'
import { fuzzyScore } from '../../search'
import { decorate } from '../../gitColors'
import { FilterInput } from './FilterInput'
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '../ui/Menu'

type GitAction = 'commit' | 'pull' | 'push' | 'fetch' | 'stashPush' | 'stashPop' | 'discardAll'

export function GitView() {
  const project = useStore((s) => selectedProject(s.state))

  // Opening the view compensates for the .git-metadata-only watcher.
  // Keyed on the id (not object identity) to avoid redundant refreshes.
  const projectId = project?.id
  useEffect(() => {
    if (projectId) void window.telchar.git.refresh(projectId).then(useRuntime.getState().applyGit)
  }, [projectId])

  // Keyed on project id so message/query/busy reset when switching projects.
  return project ? (
    <ProjectGitBlock key={project.id} project={project} />
  ) : (
    <div className="px-3 py-2 text-[10px] font-semibold tracking-widest text-dim">GIT</div>
  )
}

function ProjectGitBlock({ project }: { project: ProjectGroup }) {
  const status = useRuntime((s) => s.git[project.id])
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<false | GitAction>(false)
  const [error, setError] = useState('')

  // Commit the staged set when anything is staged; otherwise fall back to
  // commit-everything (preserves the pre-staging one-click behavior).
  const stagedCount = status?.repo ? status.files.filter((f) => f.index !== '.' && f.index !== '?').length : 0

  const run = async (kind: GitAction) => {
    setBusy(kind)
    setError('')
    try {
      const git = window.telchar.git
      const res =
        kind === 'commit'
          ? stagedCount > 0
            ? await git.commit(project.id, message.trim())
            : await git.commitAll(project.id, message.trim())
          : kind === 'pull'
            ? await git.pull(project.id)
            : kind === 'push'
              ? await git.push(project.id)
              : kind === 'fetch'
                ? await git.fetch(project.id)
                : kind === 'stashPush'
                  ? await git.stashPush(project.id)
                  : kind === 'stashPop'
                    ? await git.stashPop(project.id)
                    : await git.discardAll(project.id)
      if (!res.ok) setError((res.stderr || res.stdout || 'failed').trim().slice(0, 600))
      else if (kind === 'commit') setMessage('')
    } finally {
      setBusy(false)
    }
  }

  const refresh = () => void window.telchar.git.refresh(project.id).then(useRuntime.getState().applyGit)
  const confirmDiscard = () => {
    if (window.confirm(`Discard ALL uncommitted changes in "${project.name}"?\nThis cannot be undone.`)) {
      void run('discardAll')
    }
  }

  const ready = !!status?.repo
  const files = status?.repo ? status.files : []
  const hasChanges = files.length > 0
  const visibleFiles = files.filter((f) => fuzzyScore(query, f.path) > 0)
  const menuDisabled = !ready || busy !== false

  // Porcelain XY: index (staged) char, worktree (unstaged) char. A file with
  // both staged and further-unstaged edits shows in both groups (VSCode-style).
  const staged = visibleFiles.filter((f) => f.index !== '.' && f.index !== '?')
  const changed = visibleFiles.filter((f) => f.worktree !== '.')

  const stageFiles = async (paths: string[]) => {
    setError('')
    const res = await window.telchar.git.stage(project.id, paths)
    if (!res.ok) setError((res.stderr || res.stdout || 'stage failed').trim().slice(0, 600))
  }
  const unstageFiles = async (paths: string[]) => {
    setError('')
    const res = await window.telchar.git.unstage(project.id, paths)
    if (!res.ok) setError((res.stderr || res.stdout || 'unstage failed').trim().slice(0, 600))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[10px] font-semibold tracking-widest text-dim">GIT</span>
        <Menu>
          <MenuTrigger asChild>
            <button
              title="Git actions"
              className="cursor-pointer rounded p-0.5 text-dim hover:bg-panel hover:text-fg"
            >
              <MoreHorizontal size={14} />
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onSelect={() => void run('push')} disabled={menuDisabled}>
              <ArrowUp size={14} /> Push
            </MenuItem>
            <MenuItem onSelect={() => void run('pull')} disabled={menuDisabled}>
              <ArrowDown size={14} /> Pull
            </MenuItem>
            <MenuItem onSelect={() => void run('fetch')} disabled={menuDisabled}>
              <Download size={14} /> Fetch
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => void run('stashPush')} disabled={menuDisabled || !hasChanges}>
              <Archive size={14} /> Stash changes
            </MenuItem>
            <MenuItem onSelect={() => void run('stashPop')} disabled={menuDisabled}>
              <ArchiveRestore size={14} /> Unstash (pop)
            </MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={refresh} disabled={!ready}>
              <RefreshCw size={14} /> Refresh status
            </MenuItem>
            <MenuItem onSelect={confirmDiscard} disabled={menuDisabled || !hasChanges}>
              <Trash2 size={14} className="text-red-400" />
              <span className="text-red-400">Discard all changes</span>
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2.5">
        {!ready ? (
          <div className="pt-0.5">
            <div className="flex items-center gap-2 font-semibold">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
              {project.name}
            </div>
            <div className="pt-1 pl-4 text-dim">{status ? 'not a git repository' : 'loading…'}</div>
          </div>
        ) : (
          <div className="pt-0.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project.color }} />
              <span className="min-w-0 flex-1 truncate font-semibold">{project.name}</span>
              <span className="flex items-center gap-1 text-dim">
                <GitBranch size={11} />
                <span className="max-w-[90px] truncate">{status!.branch ?? '?'}</span>
                {(status!.ahead ?? 0) > 0 && (
                  <span className="flex items-center text-accent">
                    <ArrowUp size={10} />
                    {status!.ahead}
                  </span>
                )}
                {(status!.behind ?? 0) > 0 && (
                  <span className="flex items-center text-amber-400">
                    <ArrowDown size={10} />
                    {status!.behind}
                  </span>
                )}
              </span>
            </div>

            {hasChanges ? (
              <>
                <FilterInput value={query} onChange={setQuery} placeholder="Filter changes…" className="pt-2" />

                <div className="max-h-72 overflow-y-auto py-1">
                  {staged.length > 0 && (
                    <FileGroup
                      label="Staged"
                      files={staged}
                      action="unstage"
                      onAll={() => void unstageFiles(staged.map((f) => f.path))}
                      onFile={(p) => void unstageFiles([p])}
                    />
                  )}
                  {changed.length > 0 && (
                    <FileGroup
                      label="Changes"
                      files={changed}
                      action="stage"
                      onAll={() => void stageFiles(changed.map((f) => f.path))}
                      onFile={(p) => void stageFiles([p])}
                    />
                  )}
                  {query && visibleFiles.length === 0 && <div className="pl-4 text-dim">No matches.</div>}
                  {!query && status!.fileTotal > files.length && (
                    <div className="pl-4 text-dim">+{status!.fileTotal - files.length} more…</div>
                  )}
                </div>

                <div className="pt-1">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && message.trim()) void run('commit')
                    }}
                    placeholder="Commit message… (⌘⏎ to commit)"
                    rows={2}
                    className="w-full resize-none rounded border border-border bg-bg px-2.5 py-1.5 text-fg outline-none placeholder:text-dim focus:border-accent"
                  />
                  <button
                    title={stagedCount > 0 ? `Commit ${stagedCount} staged file(s)` : 'Commit all changes'}
                    disabled={busy !== false || !message.trim()}
                    onClick={() => void run('commit')}
                    className="mt-1.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded bg-accent py-1.5 font-medium text-bg hover:bg-accent/90 disabled:cursor-default disabled:opacity-40"
                  >
                    {busy === 'commit' ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                    {stagedCount > 0 ? `Commit ${stagedCount} staged` : 'Commit all'}
                  </button>
                </div>
              </>
            ) : (
              <div className="pt-2 pl-4 text-dim">clean</div>
            )}
          </div>
        )}

        {error && (
          <pre className="mt-1.5 max-h-32 overflow-y-auto rounded border border-red-900 bg-red-950/40 p-2 font-mono text-[11px] whitespace-pre-wrap text-red-300">
            {error}
          </pre>
        )}
      </div>
    </div>
  )
}

// A Staged / Changes group: header with a stage-all or unstage-all affordance,
// then one row per file with a hover +/- button.
function FileGroup({
  label,
  files,
  action,
  onAll,
  onFile
}: {
  label: string
  files: GitFileEntry[]
  action: 'stage' | 'unstage'
  onAll: () => void
  onFile: (path: string) => void
}) {
  const Icon = action === 'stage' ? Plus : Minus
  const allTitle = action === 'stage' ? 'Stage all' : 'Unstage all'
  return (
    <div className="pt-1 first:pt-0">
      <div className="group/hdr flex items-center gap-2 py-0.5 pl-1">
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold tracking-widest text-dim">
          {label} ({files.length})
        </span>
        <button
          title={allTitle}
          onClick={onAll}
          className="shrink-0 cursor-pointer rounded p-0.5 text-dim opacity-0 group-hover/hdr:opacity-100 hover:bg-panel hover:text-fg"
        >
          <Icon size={13} />
        </button>
      </div>
      {files.map((f) => {
        const d = decorate(f)
        return (
          <div
            key={f.path}
            className="group/row flex items-center gap-2 py-0.5 pl-4"
            title={`${d.label}: ${f.path}`}
          >
            <span className="min-w-0 flex-1 truncate" style={{ color: d.color }}>
              {f.path}
            </span>
            <button
              title={action === 'stage' ? 'Stage' : 'Unstage'}
              onClick={() => onFile(f.path)}
              className="shrink-0 cursor-pointer rounded p-0.5 text-dim opacity-0 group-hover/row:opacity-100 hover:bg-panel hover:text-fg"
            >
              <Icon size={12} />
            </button>
            <span className="w-3 text-center font-bold" style={{ color: d.color }}>
              {d.letter}
            </span>
          </div>
        )
      })}
    </div>
  )
}
