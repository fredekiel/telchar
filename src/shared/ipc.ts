// Single typed IPC contract shared by main + preload + renderer.
// Channels are namespaced verbs. The preload exposes a verb-based API,
// never a generic invoke(channel, payload) passthrough.

import type {
  EnsureResult,
  PersistedState,
  ProjectGroup,
  RuntimeStatus,
  SpawnOptions
} from './types'

export const IPC = {
  // pty (renderer -> main, request/response)
  ptyEnsure: 'pty:ensure',
  ptyInput: 'pty:input',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptySnapshot: 'pty:snapshot',
  // pty (main -> renderer, push)
  ptyData: 'pty:data',
  ptyStatus: 'pty:status',
  // workspace persistence
  stateLoad: 'state:load',
  stateSave: 'state:save',
  stateSaveSync: 'state:saveSync',
  // projects
  projectPick: 'project:pick',
  // markdown / plan
  markdownWatch: 'markdown:watch',
  markdownUnwatch: 'markdown:unwatch',
  markdownChanged: 'markdown:changed',
  plansList: 'plans:list',
  plansForProject: 'plans:forProject',
  plansDirChanged: 'plans:dirChanged',
  // git
  gitWatch: 'git:watch',
  gitUnwatch: 'git:unwatch',
  gitRefresh: 'git:refresh',
  gitCommitAll: 'git:commitAll',
  gitPull: 'git:pull',
  gitPush: 'git:push',
  gitFetch: 'git:fetch',
  gitStashPush: 'git:stashPush',
  gitStashPop: 'git:stashPop',
  gitDiscardAll: 'git:discardAll',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitCommit: 'git:commit',
  gitStatus: 'git:status',
  // filesystem (containment-checked)
  fsReadDir: 'fs:readDir',
  fsReadFile: 'fs:readFile',
  fsListFiles: 'fs:listFiles',
  // filesystem writes (containment-checked; create/rename-dest guard the parent)
  fsWriteFile: 'fs:writeFile',
  fsCreateFile: 'fs:createFile',
  fsCreateDir: 'fs:createDir',
  fsRename: 'fs:rename',
  fsDelete: 'fs:delete',
  // worktree watching (Files view lifecycle only — see worktreeWatcher.ts)
  fsWatchTree: 'fs:watchTree',
  fsUnwatchTree: 'fs:unwatchTree',
  fsChanged: 'fs:changed',
  // claude integration
  claudeHook: 'claude:hook',
  claudeInstallHooks: 'claude:installHooks',
  claudeSessionInfo: 'claude:sessionInfo',
  // app chrome
  appSetBadge: 'app:setBadge',
  // window controls (custom title bar chrome on Windows/Linux)
  windowMinimize: 'window:minimize',
  windowMaximizeToggle: 'window:maximizeToggle',
  windowClose: 'window:close',
  // keyboard shortcuts (main menu accelerators -> renderer)
  shortcut: 'app:shortcut'
} as const

// Menu-driven shortcuts. Indexed actions carry a 1-based index.
export type ShortcutAction =
  | { type: 'new-terminal' }
  | { type: 'close-tab' }
  | { type: 'next-tab' }
  | { type: 'prev-tab' }
  | { type: 'focus-pane'; index: number }
  | { type: 'split-right' }
  | { type: 'split-down' }
  | { type: 'maximize-pane' }
  | { type: 'toggle-sidebar' }
  | { type: 'quick-open' }
  | { type: 'command-palette' }
  | { type: 'toggle-overview' }
  | { type: 'jump-attention' }
  | { type: 'next-layout' }
  | { type: 'prev-layout' }
  | { type: 'new-layout' }
  | { type: 'keybinds' }

// ---- payload shapes (also the basis for runtime validation in main) ----

export interface PtyDataMessage {
  tabId: string
  // batched, base64-encoded binary chunk (coalesced per frame in main)
  data: string
}

export interface PtyStatusMessage {
  tabId: string
  status: RuntimeStatus
  exitCode?: number
  // Foreground process name (from IPty.process), when known.
  fgProcess?: string
  // Convenience: fgProcess matched the claude CLI.
  isClaude?: boolean
}

export interface MarkdownChangedMessage {
  path: string
  content: string
}

export interface PlanEntry {
  path: string
  title: string
  mtimeMs: number
}

// A plan .md was added/changed under ~/.claude/plans (push, main -> renderer).
export interface PlansDirChangedMessage {
  path: string
}

// ---- git ----

export interface GitFileEntry {
  path: string
  index: string // porcelain XY: staged char ('.', 'M', 'A', 'D', 'R', 'U', '?')
  worktree: string // unstaged char
  renamedFrom?: string
}

export interface GitProjectStatus {
  projectId: string
  repo: boolean
  repoRoot?: string
  branch?: string
  upstream?: string
  ahead?: number
  behind?: number
  files: GitFileEntry[]
  fileTotal: number
  updatedAt: number
}

export interface GitActionResult {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
}

// ---- claude hooks ----

export interface ClaudeHookMessage {
  tabId: string
  event: string // 'Notification' | 'Stop' | 'SessionStart' | future lifecycle events
  payload: unknown
}

// Resolved from a session transcript (exact via hook transcript_path, or the
// project's newest transcript as fallback). All fields fail soft to undefined.
export interface ClaudeSessionInfo {
  planPath?: string
  planTitle?: string
  contextTokens?: number
}

// ---- workspace persistence ----

// Set when loadState had to reset: the previous file was backed up (never
// silently destroyed) and the renderer should tell the user where it went.
export interface StateLoadNotice {
  kind: 'corrupt-reset' | 'newer-version-reset'
  backupPath?: string
}

export interface StateLoadResult {
  state: PersistedState
  notice?: StateLoadNotice
}

// ---- filesystem ----

export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'dir' | 'symlink' | 'other'
}

export interface DirListing {
  entries: DirEntry[]
  truncated: boolean
}

export interface FileContent {
  content: string
  size: number
  truncated: boolean
  binary: boolean
}

export interface FileList {
  files: string[] // repo-relative paths
  truncated: boolean
}

// Result of a filesystem write/create/rename/delete. Renderer surfaces the
// error inline rather than relying on a thrown IPC rejection.
export type FsWriteResult = { ok: true } | { ok: false; error: string }

// Debounced worktree change batch. dirs = absolute directories whose listings
// changed; null = too many distinct dirs, refetch everything open.
export interface FsChangedMessage {
  projectId: string
  dirs: string[] | null
}

// The typed surface exposed on window.telchar by the preload.
export interface TelcharApi {
  pty: {
    ensure(opts: SpawnOptions): Promise<EnsureResult>
    input(tabId: string, data: string): void
    resize(tabId: string, cols: number, rows: number): void
    kill(tabId: string): void
    snapshot(tabId: string): Promise<string>
    onData(cb: (msg: PtyDataMessage) => void): () => void
    onStatus(cb: (msg: PtyStatusMessage) => void): () => void
  }
  state: {
    load(): Promise<StateLoadResult>
    save(state: PersistedState): Promise<void>
    // Blocking save for beforeunload — the async path can't finish once the
    // window is tearing down.
    saveSync(state: PersistedState): void
  }
  project: {
    pick(): Promise<ProjectGroup | null>
  }
  markdown: {
    watch(path: string): Promise<string>
    unwatch(path: string): void
    onChanged(cb: (msg: MarkdownChangedMessage) => void): () => void
    listPlans(): Promise<PlanEntry[]>
    // Plan basenames referenced by the project's Claude session transcripts.
    plansForProject(projectPath: string): Promise<string[]>
    // Fires when any plan .md under ~/.claude/plans is added/changed.
    onPlansChanged(cb: (msg: PlansDirChangedMessage) => void): () => void
  }
  git: {
    watch(projectId: string, path: string): Promise<GitProjectStatus>
    unwatch(projectId: string): void
    refresh(projectId: string): Promise<GitProjectStatus>
    commitAll(projectId: string, message: string): Promise<GitActionResult>
    pull(projectId: string): Promise<GitActionResult>
    push(projectId: string): Promise<GitActionResult>
    fetch(projectId: string): Promise<GitActionResult>
    stashPush(projectId: string): Promise<GitActionResult>
    stashPop(projectId: string): Promise<GitActionResult>
    discardAll(projectId: string): Promise<GitActionResult>
    // Per-file staging. paths are repo-relative; directories stage their subtree.
    stage(projectId: string, paths: string[]): Promise<GitActionResult>
    unstage(projectId: string, paths: string[]): Promise<GitActionResult>
    // Commit only what is currently staged (no add). Distinct from commitAll.
    commit(projectId: string, message: string): Promise<GitActionResult>
    onStatus(cb: (status: GitProjectStatus) => void): () => void
  }
  fs: {
    readDir(path: string): Promise<DirListing>
    readFile(path: string): Promise<FileContent>
    listFiles(path: string): Promise<FileList>
    writeFile(path: string, content: string): Promise<FsWriteResult>
    createFile(parentDir: string, name: string): Promise<FsWriteResult>
    createDir(parentDir: string, name: string): Promise<FsWriteResult>
    rename(path: string, newName: string): Promise<FsWriteResult>
    delete(path: string): Promise<FsWriteResult>
    watchTree(projectId: string, path: string): void
    unwatchTree(projectId: string): void
    onChanged(cb: (msg: FsChangedMessage) => void): () => void
  }
  claude: {
    installHooks(): Promise<{ ok: boolean; detail: string }>
    onHook(cb: (msg: ClaudeHookMessage) => void): () => void
    sessionInfo(opts: { transcriptPath?: string; projectPath?: string }): Promise<ClaudeSessionInfo>
  }
  app: {
    setBadge(count: number): void
  }
  // Frameless window controls — only wired up on Windows/Linux (macOS uses
  // native traffic lights via titleBarStyle: 'hiddenInset').
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
  }
  // The host OS, read once at preload. Drives platform-specific chrome.
  platform: NodeJS.Platform
  onShortcut(cb: (action: ShortcutAction) => void): () => void
}
