// Lazy file tree of the selected project. Git-decorated (VSCode colors).
// Right-click a row (or use the header buttons) to create / rename / delete
// files & folders and stage / unstage git changes. Mutations go through the
// containment-checked fs/git IPC verbs; the worktree watcher refetches the
// affected dir so the tree reflects the change with no manual reload.

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronDown, ChevronRight, FilePlus, FileText, FolderPlus, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import type { DirEntry } from '@shared/ipc'
import type { ProjectGroup } from '@shared/types'
import { useStore, selectedProject } from '../../store'
import { useRuntime } from '../../state/runtime'
import { fuzzyScore, useFileIndex } from '../../search'
import { decorate, GIT_COLORS } from '../../gitColors'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '../ui/ContextMenu'
import { FilterInput } from './FilterInput'

// Debounced worktree change batch from main. dirs = absolute directories whose
// listings changed; null = overflow, refetch everything open. seq 0 = nothing yet.
interface FsChange {
  seq: number
  dirs: Set<string> | null
}

// Repo-relative path for a git command; null when outside the repo root.
function gitRel(repoRoot: string | undefined, abs: string): string | null {
  if (!repoRoot) return null
  if (abs === repoRoot) return '.'
  if (abs.startsWith(repoRoot + '/')) return abs.slice(repoRoot.length + 1)
  return null
}

// Inline single-line editor for create / rename. Enter commits, Escape or blur
// cancels; stops propagation so the row's click/toggle doesn't fire.
function InlineInput({
  initial,
  onCommit,
  onCancel,
  style
}: {
  initial: string
  onCommit: (value: string) => void
  onCancel: () => void
  style?: CSSProperties
}) {
  const [value, setValue] = useState(initial)
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={onCancel}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          const v = value.trim()
          if (v) onCommit(v)
          else onCancel()
        } else if (e.key === 'Escape') {
          onCancel()
        }
      }}
      style={style}
      className="min-w-0 flex-1 rounded border border-accent bg-bg px-1 py-0 text-fg outline-none"
    />
  )
}

export function FilesView() {
  const project = useStore((s) => selectedProject(s.state))
  const [query, setQuery] = useState('')
  const [rootCreate, setRootCreate] = useState<'file' | 'dir' | null>(null)
  const [rootErr, setRootErr] = useState('')

  // Opening the view compensates for the .git-metadata-only watcher (same as GitView).
  const projectId = project?.id
  useEffect(() => {
    if (projectId) void window.telchar.git.refresh(projectId).then(useRuntime.getState().applyGit)
  }, [projectId])

  // Recursive worktree watcher lives only while this view is mounted (perf
  // budget: one watched project max). Keeps tree AND git decorations live for
  // edits from ptys (claude, npm, ...) and external editors.
  const projectPath = project?.path
  const [fsChange, setFsChange] = useState<FsChange>({ seq: 0, dirs: null })
  useEffect(() => {
    if (!projectId || !projectPath) return
    window.telchar.fs.watchTree(projectId, projectPath)
    const off = window.telchar.fs.onChanged((msg) => {
      if (msg.projectId !== projectId) return
      setFsChange((prev) => ({ seq: prev.seq + 1, dirs: msg.dirs ? new Set(msg.dirs) : null }))
    })
    return () => {
      off()
      window.telchar.fs.unwatchTree(projectId)
    }
  }, [projectId, projectPath])

  if (!project) return null

  const createRoot = async (name: string) => {
    setRootErr('')
    const res =
      rootCreate === 'file'
        ? await window.telchar.fs.createFile(project.path, name)
        : await window.telchar.fs.createDir(project.path, name)
    if (res.ok) setRootCreate(null)
    else setRootErr(res.error)
  }

  return (
    <>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="truncate text-[10px] font-semibold tracking-widest text-dim">
          FILES — {project.name.toUpperCase()}
        </span>
        <div className="flex items-center gap-1 text-dim">
          <button
            title="New file"
            onClick={() => {
              setRootErr('')
              setRootCreate('file')
            }}
            className="cursor-pointer rounded p-0.5 hover:bg-panel hover:text-fg"
          >
            <FilePlus size={13} />
          </button>
          <button
            title="New folder"
            onClick={() => {
              setRootErr('')
              setRootCreate('dir')
            }}
            className="cursor-pointer rounded p-0.5 hover:bg-panel hover:text-fg"
          >
            <FolderPlus size={13} />
          </button>
        </div>
      </div>
      <FilterInput value={query} onChange={setQuery} placeholder="Filter files…" />
      <div className="flex-1 overflow-y-auto pb-2">
        {!query && rootCreate && (
          <div className="flex items-center gap-1.5 py-0.5 pr-2" style={{ paddingLeft: 20 }}>
            {rootCreate === 'file' ? (
              <FileText size={12} className="shrink-0 text-dim" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-dim" />
            )}
            <InlineInput initial="" onCommit={createRoot} onCancel={() => setRootCreate(null)} />
          </div>
        )}
        {!query && rootErr && <div className="px-3 py-0.5 text-red-400">{rootErr}</div>}
        {query ? (
          // Flat fuzzy results over the full file index — the tree is lazily
          // fetched per dir, so filtering its loaded nodes would miss files in
          // unexpanded dirs. Tree stays mounted-state simple: render swap only.
          <FlatResults project={project} query={query} />
        ) : (
          <DirNode
            key={project.id}
            project={project}
            path={project.path}
            depth={0}
            initiallyOpen
            fsChange={fsChange}
          />
        )}
      </div>
    </>
  )
}

function FlatResults({ project, query }: { project: ProjectGroup; query: string }) {
  const openFile = useStore((s) => s.openFile)
  const index = useFileIndex(true)
  const decorations = useGitDecorations(project)
  const files = index.get(project.id)

  const hits = useMemo(() => {
    const scored: { relPath: string; score: number }[] = []
    for (const relPath of files ?? []) {
      const score = fuzzyScore(query, relPath)
      if (score > 0) scored.push({ relPath, score })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 200)
  }, [files, query])

  if (!files) return <div className="px-3 py-2 text-dim">Loading…</div>
  if (hits.length === 0) return <div className="px-3 py-2 text-dim">No matches.</div>

  return (
    <>
      {hits.map(({ relPath }) => {
        const absPath = `${project.path}/${relPath}`
        const d = decorations.byPath.get(absPath)
        return (
          <div
            key={relPath}
            onClick={() => openFile(project, absPath, relPath.split('/').pop() ?? relPath)}
            title={absPath}
            className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 hover:bg-panel"
          >
            <FileText size={12} className="shrink-0 text-dim" />
            <span className="min-w-0 flex-1 truncate" style={d ? { color: d.color } : undefined}>
              {relPath}
            </span>
            {d && (
              <span className="w-3 shrink-0 text-center font-bold" style={{ color: d.color }} title={d.label}>
                {d.letter}
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

function useGitDecorations(project: ProjectGroup) {
  const git = useRuntime((s) => s.git[project.id])
  return useMemo(() => {
    const byPath = new Map<string, ReturnType<typeof decorate>>()
    const statusByPath = new Map<string, { index: string; worktree: string }>()
    const dirtyDirs = new Set<string>()
    const repoRoot = git?.repo ? git.repoRoot : undefined
    if (git?.repo && git.repoRoot) {
      for (const f of git.files) {
        const abs = `${git.repoRoot}/${f.path}`
        byPath.set(abs, decorate(f))
        statusByPath.set(abs, { index: f.index, worktree: f.worktree })
        // Bubble modified state up the directory chain (VSCode-style).
        let dir = abs
        while (dir.length > git.repoRoot.length) {
          dir = dir.slice(0, dir.lastIndexOf('/'))
          dirtyDirs.add(dir)
        }
      }
    }
    return { byPath, dirtyDirs, statusByPath, repoRoot }
  }, [git])
}

// Delete via the destructive-confirm pattern already used for git discard.
async function confirmDelete(
  path: string,
  name: string,
  isDir: boolean,
  onErr: (e: string) => void
): Promise<void> {
  const what = isDir ? 'folder and all its contents' : 'file'
  if (!window.confirm(`Delete ${what} "${name}"?\nThis cannot be undone.`)) return
  const res = await window.telchar.fs.delete(path)
  if (!res.ok) onErr(res.error)
}

function DirNode({
  project,
  path,
  depth,
  initiallyOpen = false,
  name,
  fsChange
}: {
  project: ProjectGroup
  path: string
  depth: number
  initiallyOpen?: boolean
  name?: string
  fsChange: FsChange
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [creating, setCreating] = useState<'file' | 'dir' | null>(null)
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const decorations = useGitDecorations(project)

  useEffect(() => {
    if (!open || entries) return
    let alive = true
    void window.telchar.fs
      .readDir(path)
      .then((res) => {
        if (!alive) return
        setEntries(res.entries.filter((e) => e.name !== '.git'))
        setTruncated(res.truncated)
      })
      .catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
  }, [open, entries, path])

  // Worktree watcher flagged this dir (or overflowed) — refetch in place, no
  // loading flash, keeping child expansion (keyed by path).
  useEffect(() => {
    if (fsChange.seq === 0 || !open || !entries) return
    if (fsChange.dirs && !fsChange.dirs.has(path)) return
    let alive = true
    void window.telchar.fs
      .readDir(path)
      .then((res) => {
        if (!alive) return
        setEntries(res.entries.filter((e) => e.name !== '.git'))
        setTruncated(res.truncated)
      })
      .catch(() => alive && setEntries([]))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsChange, open, path])

  const pad = { paddingLeft: 8 + depth * 12 }
  const childPad = { paddingLeft: 8 + (depth + 1) * 12 }
  const dirty = decorations.dirtyDirs.has(path)

  const startCreate = (kind: 'file' | 'dir') => {
    setErr('')
    setOpen(true)
    setCreating(kind)
  }
  const create = async (childName: string) => {
    setErr('')
    const res =
      creating === 'file'
        ? await window.telchar.fs.createFile(path, childName)
        : await window.telchar.fs.createDir(path, childName)
    if (res.ok) setCreating(null)
    else setErr(res.error)
  }
  const rename = async (newName: string) => {
    setErr('')
    const res = await window.telchar.fs.rename(path, newName)
    if (res.ok) setEditing(false)
    else setErr(res.error)
  }
  const rel = gitRel(decorations.repoRoot, path)
  const stage = async () => {
    if (!rel) return
    const res = await window.telchar.git.stage(project.id, [rel])
    if (!res.ok) setErr(res.stderr || 'stage failed')
  }
  const unstage = async () => {
    if (!rel) return
    const res = await window.telchar.git.unstage(project.id, [rel])
    if (!res.ok) setErr(res.stderr || 'unstage failed')
  }

  return (
    <div>
      {name !== undefined &&
        (editing ? (
          <div style={pad} className="flex items-center gap-1 py-0.5 pr-2">
            <ChevronRight size={12} className="shrink-0 text-dim" />
            <InlineInput initial={name} onCommit={rename} onCancel={() => setEditing(false)} />
          </div>
        ) : (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => setOpen((v) => !v)}
                style={pad}
                className="flex cursor-pointer items-center gap-1 py-0.5 pr-2 hover:bg-panel"
              >
                <span className="text-dim">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                <span
                  className="min-w-0 flex-1 truncate"
                  style={dirty ? { color: GIT_COLORS.modified } : undefined}
                >
                  {name}
                </span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => startCreate('file')}>
                <FilePlus size={14} /> New File
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => startCreate('dir')}>
                <FolderPlus size={14} /> New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => setEditing(true)}>
                <Pencil size={14} /> Rename
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => void confirmDelete(path, name, true, setErr)}>
                <Trash2 size={14} className="text-red-400" />
                <span className="text-red-400">Delete</span>
              </ContextMenuItem>
              {rel && dirty && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => void stage()}>
                    <Plus size={14} /> Stage changes
                  </ContextMenuItem>
                  <ContextMenuItem onSelect={() => void unstage()}>
                    <Minus size={14} /> Unstage changes
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        ))}
      {err && (
        <div style={childPad} className="py-0.5 text-red-400">
          {err}
        </div>
      )}
      {open && (
        <div>
          {creating && (
            <div className="flex items-center gap-1.5 py-0.5 pr-2" style={childPad}>
              {creating === 'file' ? (
                <FileText size={12} className="shrink-0 text-dim" />
              ) : (
                <ChevronRight size={12} className="shrink-0 text-dim" />
              )}
              <InlineInput initial="" onCommit={create} onCancel={() => setCreating(null)} />
            </div>
          )}
          {entries?.map((e) =>
            e.kind === 'dir' ? (
              <DirNode
                key={e.path}
                project={project}
                path={e.path}
                depth={depth + 1}
                name={e.name}
                fsChange={fsChange}
              />
            ) : (
              <FileLeaf key={e.path} project={project} entry={e} depth={depth + 1} decorations={decorations} />
            )
          )}
          {truncated && (
            <div style={childPad} className="py-0.5 text-dim">
              …truncated
            </div>
          )}
          {entries && entries.length === 0 && !creating && (
            <div style={childPad} className="py-0.5 text-dim">
              empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FileLeaf({
  project,
  entry,
  depth,
  decorations
}: {
  project: ProjectGroup
  entry: DirEntry
  depth: number
  decorations: ReturnType<typeof useGitDecorations>
}) {
  const openFile = useStore((s) => s.openFile)
  const [editing, setEditing] = useState(false)
  const [err, setErr] = useState('')
  const d = decorations.byPath.get(entry.path)
  const pad = { paddingLeft: 8 + depth * 12 }

  const rename = async (newName: string) => {
    setErr('')
    const res = await window.telchar.fs.rename(entry.path, newName)
    if (res.ok) setEditing(false)
    else setErr(res.error)
  }
  const rel = gitRel(decorations.repoRoot, entry.path)
  const st = decorations.statusByPath.get(entry.path)
  const canStage = !!st && st.worktree !== '.' // unstaged edits or untracked ('?')
  const canUnstage = !!st && st.index !== '.' && st.index !== '?' // real staged char
  const stage = async () => {
    if (!rel) return
    const res = await window.telchar.git.stage(project.id, [rel])
    if (!res.ok) setErr(res.stderr || 'stage failed')
  }
  const unstage = async () => {
    if (!rel) return
    const res = await window.telchar.git.unstage(project.id, [rel])
    if (!res.ok) setErr(res.stderr || 'unstage failed')
  }

  if (editing) {
    return (
      <div style={pad} className="flex items-center gap-1.5 py-0.5 pr-2">
        <FileText size={12} className="shrink-0 text-dim" />
        <InlineInput initial={entry.name} onCommit={rename} onCancel={() => setEditing(false)} />
      </div>
    )
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onClick={() => openFile(project, entry.path, entry.name)}
            style={pad}
            title={entry.path}
            className="flex cursor-pointer items-center gap-1.5 py-0.5 pr-2 hover:bg-panel"
          >
            <FileText size={12} className="shrink-0 text-dim" />
            <span className="min-w-0 flex-1 truncate" style={d ? { color: d.color } : undefined}>
              {entry.name}
            </span>
            {d && (
              <span className="w-3 shrink-0 text-center font-bold" style={{ color: d.color }} title={d.label}>
                {d.letter}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setEditing(true)}>
            <Pencil size={14} /> Rename
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void confirmDelete(entry.path, entry.name, false, setErr)}>
            <Trash2 size={14} className="text-red-400" />
            <span className="text-red-400">Delete</span>
          </ContextMenuItem>
          {rel && (canStage || canUnstage) && (
            <>
              <ContextMenuSeparator />
              {canStage && (
                <ContextMenuItem onSelect={() => void stage()}>
                  <Plus size={14} /> Stage changes
                </ContextMenuItem>
              )}
              {canUnstage && (
                <ContextMenuItem onSelect={() => void unstage()}>
                  <Minus size={14} /> Unstage changes
                </ContextMenuItem>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {err && (
        <div style={pad} className="py-0.5 text-red-400">
          {err}
        </div>
      )}
    </>
  )
}
