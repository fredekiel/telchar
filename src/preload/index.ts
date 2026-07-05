import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type TelcharApi,
  type PtyDataMessage,
  type PtyStatusMessage,
  type MarkdownChangedMessage,
  type PlansDirChangedMessage,
  type GitProjectStatus,
  type FsChangedMessage,
  type ClaudeHookMessage,
  type ShortcutAction
} from '@shared/ipc'

// Minimal, verb-based API. No generic invoke(channel, payload) passthrough,
// no raw ipcRenderer exposure.
const api: TelcharApi = {
  pty: {
    ensure: (opts) => ipcRenderer.invoke(IPC.ptyEnsure, opts),
    input: (tabId, data) => ipcRenderer.send(IPC.ptyInput, tabId, data),
    resize: (tabId, cols, rows) => ipcRenderer.send(IPC.ptyResize, tabId, cols, rows),
    kill: (tabId) => ipcRenderer.send(IPC.ptyKill, tabId),
    snapshot: (tabId) => ipcRenderer.invoke(IPC.ptySnapshot, tabId),
    onData: (cb) => {
      const h = (_e: unknown, msg: PtyDataMessage) => cb(msg)
      ipcRenderer.on(IPC.ptyData, h)
      return () => ipcRenderer.removeListener(IPC.ptyData, h)
    },
    onStatus: (cb) => {
      const h = (_e: unknown, msg: PtyStatusMessage) => cb(msg)
      ipcRenderer.on(IPC.ptyStatus, h)
      return () => ipcRenderer.removeListener(IPC.ptyStatus, h)
    }
  },
  state: {
    load: () => ipcRenderer.invoke(IPC.stateLoad),
    save: (state) => ipcRenderer.invoke(IPC.stateSave, state),
    saveSync: (state) => {
      ipcRenderer.sendSync(IPC.stateSaveSync, state)
    }
  },
  project: {
    pick: () => ipcRenderer.invoke(IPC.projectPick)
  },
  markdown: {
    watch: (path) => ipcRenderer.invoke(IPC.markdownWatch, path),
    unwatch: (path) => ipcRenderer.send(IPC.markdownUnwatch, path),
    onChanged: (cb) => {
      const h = (_e: unknown, msg: MarkdownChangedMessage) => cb(msg)
      ipcRenderer.on(IPC.markdownChanged, h)
      return () => ipcRenderer.removeListener(IPC.markdownChanged, h)
    },
    listPlans: () => ipcRenderer.invoke(IPC.plansList),
    plansForProject: (projectPath) => ipcRenderer.invoke(IPC.plansForProject, projectPath),
    onPlansChanged: (cb) => {
      const h = (_e: unknown, msg: PlansDirChangedMessage) => cb(msg)
      ipcRenderer.on(IPC.plansDirChanged, h)
      return () => ipcRenderer.removeListener(IPC.plansDirChanged, h)
    }
  },
  git: {
    watch: (projectId, path) => ipcRenderer.invoke(IPC.gitWatch, { projectId, path }),
    unwatch: (projectId) => ipcRenderer.send(IPC.gitUnwatch, projectId),
    refresh: (projectId) => ipcRenderer.invoke(IPC.gitRefresh, projectId),
    commitAll: (projectId, message) => ipcRenderer.invoke(IPC.gitCommitAll, { projectId, message }),
    pull: (projectId) => ipcRenderer.invoke(IPC.gitPull, projectId),
    push: (projectId) => ipcRenderer.invoke(IPC.gitPush, projectId),
    fetch: (projectId) => ipcRenderer.invoke(IPC.gitFetch, projectId),
    stashPush: (projectId) => ipcRenderer.invoke(IPC.gitStashPush, projectId),
    stashPop: (projectId) => ipcRenderer.invoke(IPC.gitStashPop, projectId),
    discardAll: (projectId) => ipcRenderer.invoke(IPC.gitDiscardAll, projectId),
    stage: (projectId, paths) => ipcRenderer.invoke(IPC.gitStage, { projectId, paths }),
    unstage: (projectId, paths) => ipcRenderer.invoke(IPC.gitUnstage, { projectId, paths }),
    commit: (projectId, message) => ipcRenderer.invoke(IPC.gitCommit, { projectId, message }),
    onStatus: (cb) => {
      const h = (_e: unknown, status: GitProjectStatus) => cb(status)
      ipcRenderer.on(IPC.gitStatus, h)
      return () => ipcRenderer.removeListener(IPC.gitStatus, h)
    }
  },
  fs: {
    readDir: (path) => ipcRenderer.invoke(IPC.fsReadDir, path),
    readFile: (path) => ipcRenderer.invoke(IPC.fsReadFile, path),
    listFiles: (path) => ipcRenderer.invoke(IPC.fsListFiles, path),
    writeFile: (path, content) => ipcRenderer.invoke(IPC.fsWriteFile, { path, content }),
    createFile: (parentDir, name) => ipcRenderer.invoke(IPC.fsCreateFile, { parentDir, name }),
    createDir: (parentDir, name) => ipcRenderer.invoke(IPC.fsCreateDir, { parentDir, name }),
    rename: (path, newName) => ipcRenderer.invoke(IPC.fsRename, { path, newName }),
    delete: (path) => ipcRenderer.invoke(IPC.fsDelete, path),
    watchTree: (projectId, path) => ipcRenderer.send(IPC.fsWatchTree, { projectId, path }),
    unwatchTree: (projectId) => ipcRenderer.send(IPC.fsUnwatchTree, projectId),
    onChanged: (cb) => {
      const h = (_e: unknown, msg: FsChangedMessage) => cb(msg)
      ipcRenderer.on(IPC.fsChanged, h)
      return () => ipcRenderer.removeListener(IPC.fsChanged, h)
    }
  },
  claude: {
    installHooks: () => ipcRenderer.invoke(IPC.claudeInstallHooks),
    sessionInfo: (opts) => ipcRenderer.invoke(IPC.claudeSessionInfo, opts),
    onHook: (cb) => {
      const h = (_e: unknown, msg: ClaudeHookMessage) => cb(msg)
      ipcRenderer.on(IPC.claudeHook, h)
      return () => ipcRenderer.removeListener(IPC.claudeHook, h)
    }
  },
  app: {
    setBadge: (count) => ipcRenderer.send(IPC.appSetBadge, count)
  },
  onShortcut: (cb) => {
    const h = (_e: unknown, action: ShortcutAction) => cb(action)
    ipcRenderer.on(IPC.shortcut, h)
    return () => ipcRenderer.removeListener(IPC.shortcut, h)
  }
}

contextBridge.exposeInMainWorld('telchar', api)
