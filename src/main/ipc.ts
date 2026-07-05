// IPC handlers. Treat all renderer input as hostile: validate privileged
// payloads with zod and containment-check every filesystem path. The pty
// input/data hot path skips heavy schemas (just a string + id).

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename, dirname, join } from 'path'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { PROJECT_COLORS, type ProjectGroup } from '@shared/types'
import { ptyManager } from './ptyManager'
import { loadState, saveState, saveStateSync } from './persistence'
import { markdownWatcher, plansDirWatcher, listClaudePlans, plansForProject } from './watcher'
import { gitService } from './gitService'
import { worktreeWatcher } from './worktreeWatcher'
import { readDir, readFile, listFiles, writeFile, createFile, createDir, rename, deletePath } from './fsService'
import { hookServer } from './hookServer'
import { installClaudeHooks } from './claudeHooks'
import { getClaudeSessionInfo } from './claudeSession'
import { addRoot, isAllowedPath, isAllowedNewPath, rootCount } from './pathGuard'

const spawnSchema = z.object({
  tabId: z.string().min(1).max(128),
  cwd: z.string().min(1),
  shell: z.string().optional(),
  cols: z.number().int().positive().max(2000),
  rows: z.number().int().positive().max(2000)
})

const gitWatchSchema = z.object({
  projectId: z.string().min(1).max(128),
  path: z.string().min(1)
})

const gitCommitSchema = z.object({
  projectId: z.string().min(1).max(128),
  message: z.string().min(1).max(5000)
})

const gitStageSchema = z.object({
  projectId: z.string().min(1).max(128),
  paths: z.array(z.string().min(1).max(4096)).min(1).max(5000)
})

const fsWriteSchema = z.object({
  path: z.string().min(1).max(4096),
  content: z.string().max(20 * 1024 * 1024) // 20 MB ceiling on a single write
})

const fsCreateSchema = z.object({
  parentDir: z.string().min(1).max(4096),
  name: z.string().min(1).max(255)
})

const fsRenameSchema = z.object({
  path: z.string().min(1).max(4096),
  newName: z.string().min(1).max(255)
})

const claudeSessionInfoSchema = z.object({
  transcriptPath: z.string().min(1).max(4096).optional(),
  projectPath: z.string().min(1).max(4096).optional()
})

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown) => {
    getWindow()?.webContents.send(channel, payload)
  }

  ptyManager.setSinks(
    (tabId, data) => send(IPC.ptyData, { tabId, data }),
    (msg) => send(IPC.ptyStatus, msg)
  )
  markdownWatcher.setSink((path, content) => send(IPC.markdownChanged, { path, content }))
  plansDirWatcher.setSink((path) => send(IPC.plansDirChanged, { path }))
  gitService.setSink((status) => send(IPC.gitStatus, status))
  // Worktree edits feed both the file tree (push) and git decorations (refresh).
  worktreeWatcher.setSink((projectId, dirs) => {
    send(IPC.fsChanged, { projectId, dirs })
    void gitService.refresh(projectId)
  })
  hookServer.setSink((e) => send(IPC.claudeHook, e))

  // ---- pty ----
  ipcMain.handle(IPC.ptyEnsure, async (_e, raw) => {
    const opts = spawnSchema.parse(raw)
    addRoot(opts.cwd)
    return ptyManager.ensure(opts)
  })
  ipcMain.on(IPC.ptyInput, (_e, tabId: string, data: string) => {
    if (typeof tabId === 'string' && typeof data === 'string' && data.length <= 1_000_000) {
      ptyManager.input(tabId, data)
    }
  })
  ipcMain.on(IPC.ptyResize, (_e, tabId: string, cols: number, rows: number) => {
    if (typeof tabId === 'string') ptyManager.resize(tabId, cols | 0, rows | 0)
  })
  ipcMain.on(IPC.ptyKill, (_e, tabId: string) => {
    if (typeof tabId === 'string') ptyManager.kill(tabId)
  })
  ipcMain.handle(IPC.ptySnapshot, (_e, tabId: string) => ptyManager.snapshot(String(tabId)))

  // ---- workspace state ----
  ipcMain.handle(IPC.stateLoad, async () => {
    const result = await loadState()
    result.state.projects.forEach((p) => addRoot(p.path))
    return result
  })
  ipcMain.handle(IPC.stateSave, async (_e, state) => {
    await saveState(state)
  })
  // Blocking flush from beforeunload; saveStateSync zod-validates the payload.
  ipcMain.on(IPC.stateSaveSync, (e, state) => {
    try {
      saveStateSync(state)
    } catch {
      /* never block window teardown */
    }
    e.returnValue = true
  })

  // ---- projects ----
  ipcMain.handle(IPC.projectPick, async (): Promise<ProjectGroup | null> => {
    const win = getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Add project folder'
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    addRoot(path)
    return {
      id: randomUUID(),
      name: basename(path),
      path,
      color: PROJECT_COLORS[rootCount() % PROJECT_COLORS.length],
      collapsed: false
    }
  })

  // ---- git ----
  ipcMain.handle(IPC.gitWatch, async (_e, raw) => {
    const { projectId, path } = gitWatchSchema.parse(raw)
    if (!(await isAllowedPath(path))) throw new Error('path not allowed')
    return gitService.watch(projectId, path)
  })
  ipcMain.on(IPC.gitUnwatch, (_e, projectId: string) => {
    if (typeof projectId === 'string') gitService.unwatch(projectId)
  })
  ipcMain.handle(IPC.gitRefresh, (_e, projectId: string) => gitService.refresh(String(projectId)))
  ipcMain.handle(IPC.gitCommitAll, (_e, raw) => {
    const { projectId, message } = gitCommitSchema.parse(raw)
    return gitService.commitAll(projectId, message)
  })
  ipcMain.handle(IPC.gitPull, (_e, projectId: string) => gitService.pull(String(projectId)))
  ipcMain.handle(IPC.gitPush, (_e, projectId: string) => gitService.push(String(projectId)))
  ipcMain.handle(IPC.gitFetch, (_e, projectId: string) => gitService.fetch(String(projectId)))
  ipcMain.handle(IPC.gitStashPush, (_e, projectId: string) => gitService.stashPush(String(projectId)))
  ipcMain.handle(IPC.gitStashPop, (_e, projectId: string) => gitService.stashPop(String(projectId)))
  ipcMain.handle(IPC.gitDiscardAll, (_e, projectId: string) => gitService.discardAll(String(projectId)))
  ipcMain.handle(IPC.gitStage, (_e, raw) => {
    const { projectId, paths } = gitStageSchema.parse(raw)
    return gitService.stage(projectId, paths)
  })
  ipcMain.handle(IPC.gitUnstage, (_e, raw) => {
    const { projectId, paths } = gitStageSchema.parse(raw)
    return gitService.unstage(projectId, paths)
  })
  ipcMain.handle(IPC.gitCommit, (_e, raw) => {
    const { projectId, message } = gitCommitSchema.parse(raw)
    return gitService.commit(projectId, message)
  })

  // ---- filesystem (containment-checked) ----
  ipcMain.handle(IPC.fsReadDir, async (_e, path: string) => {
    if (typeof path !== 'string' || !(await isAllowedPath(path))) throw new Error('path not allowed')
    return readDir(path)
  })
  ipcMain.handle(IPC.fsReadFile, async (_e, path: string) => {
    if (typeof path !== 'string' || !(await isAllowedPath(path))) throw new Error('path not allowed')
    return readFile(path)
  })
  ipcMain.handle(IPC.fsListFiles, async (_e, path: string) => {
    if (typeof path !== 'string' || !(await isAllowedPath(path))) throw new Error('path not allowed')
    return listFiles(path)
  })

  // ---- filesystem writes (containment-checked) ----
  // Existing-target verbs guard with isAllowedPath (realpath). Create/rename-dest
  // guard the not-yet-existing target with isAllowedNewPath (validates parent).
  ipcMain.handle(IPC.fsWriteFile, async (_e, raw) => {
    const { path, content } = fsWriteSchema.parse(raw)
    if (!(await isAllowedPath(path))) return { ok: false as const, error: 'path not allowed' }
    return writeFile(path, content)
  })
  ipcMain.handle(IPC.fsCreateFile, async (_e, raw) => {
    const { parentDir, name } = fsCreateSchema.parse(raw)
    const target = join(parentDir, name)
    if (!(await isAllowedNewPath(target))) return { ok: false as const, error: 'path not allowed' }
    return createFile(target)
  })
  ipcMain.handle(IPC.fsCreateDir, async (_e, raw) => {
    const { parentDir, name } = fsCreateSchema.parse(raw)
    const target = join(parentDir, name)
    if (!(await isAllowedNewPath(target))) return { ok: false as const, error: 'path not allowed' }
    return createDir(target)
  })
  ipcMain.handle(IPC.fsRename, async (_e, raw) => {
    const { path, newName } = fsRenameSchema.parse(raw)
    const dest = join(dirname(path), newName)
    // Source must exist & be allowed; destination (same dir, new name) must pass
    // the not-yet-existing guard.
    if (!(await isAllowedPath(path))) return { ok: false as const, error: 'path not allowed' }
    if (!(await isAllowedNewPath(dest))) return { ok: false as const, error: 'destination not allowed' }
    return rename(path, dest)
  })
  ipcMain.handle(IPC.fsDelete, async (_e, path: string) => {
    if (typeof path !== 'string' || !(await isAllowedPath(path))) {
      return { ok: false as const, error: 'path not allowed' }
    }
    return deletePath(path)
  })
  ipcMain.on(IPC.fsWatchTree, (_e, raw) => {
    void (async () => {
      const { projectId, path } = gitWatchSchema.parse(raw) // same {projectId, path} shape
      if (!(await isAllowedPath(path))) return
      worktreeWatcher.watch(projectId, path)
    })().catch(() => {})
  })
  ipcMain.on(IPC.fsUnwatchTree, (_e, projectId: string) => {
    if (typeof projectId === 'string') worktreeWatcher.unwatch(projectId)
  })

  // ---- claude / app chrome ----
  ipcMain.handle(IPC.claudeInstallHooks, () => installClaudeHooks())
  ipcMain.handle(IPC.claudeSessionInfo, async (_e, raw) => {
    const opts = claudeSessionInfoSchema.parse(raw)
    // transcriptPath containment (~/.claude/projects) is enforced inside the
    // resolver; projectPath must be an already-allowed project root.
    if (opts.projectPath && !(await isAllowedPath(opts.projectPath))) return {}
    return getClaudeSessionInfo(opts)
  })
  ipcMain.on(IPC.appSetBadge, (_e, count: number) => {
    if (process.platform === 'darwin' && typeof count === 'number') {
      app.dock?.setBadge(count > 0 ? String(Math.min(count, 99)) : '')
    }
  })

  // Custom title-bar controls for the frameless Windows/Linux chrome.
  ipcMain.on(IPC.windowMinimize, () => getWindow()?.minimize())
  ipcMain.on(IPC.windowMaximizeToggle, () => {
    const w = getWindow()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on(IPC.windowClose, () => getWindow()?.close())

  // ---- markdown / plan ----
  ipcMain.handle(IPC.markdownWatch, async (_e, path: string) => {
    if (!(await isAllowedPath(path))) return ''
    return markdownWatcher.watch(path)
  })
  ipcMain.on(IPC.markdownUnwatch, (_e, path: string) => {
    if (typeof path === 'string') markdownWatcher.unwatch(path)
  })
  ipcMain.handle(IPC.plansList, () => listClaudePlans())
  ipcMain.handle(IPC.plansForProject, async (_e, raw) => {
    const path = z.string().min(1).parse(raw)
    if (!(await isAllowedPath(path))) return []
    return plansForProject(path)
  })
}
