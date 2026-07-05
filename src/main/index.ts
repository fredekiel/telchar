import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { buildMenu } from './menu'
import { ptyManager } from './ptyManager'
import { markdownWatcher, plansDirWatcher } from './watcher'
import { gitService } from './gitService'
import { worktreeWatcher } from './worktreeWatcher'
import { hookServer } from './hookServer'
import { resolveShellEnv } from './env'
import { flushStateSync } from './persistence'

let mainWindow: BrowserWindow | null = null

// Two instances would race last-writer-wins on the same workspace.json.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

// Last-gasp safety net: persist the last known-good state, log, keep running.
// Without these an escaped throw/rejection kills main silently — all PTYs die.
process.on('uncaughtException', (err) => {
  flushStateSync()
  console.error('[telchar] uncaught exception in main:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[telchar] unhandled rejection in main:', reason)
})

// PTYs live in main and ensure() is idempotent, so a renderer crash is cheap
// to recover: reload reattaches every terminal with scrollback intact.
// Guard against a crash loop (bad state that crashes on boot).
let rendererCrashes: number[] = []

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#1a1b26',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Security baseline (architecture: set once, expensive to retrofit).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Block navigation and external window.open to arbitrary URLs.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    const now = Date.now()
    rendererCrashes = rendererCrashes.filter((t) => now - t < 60_000)
    rendererCrashes.push(now)
    if (rendererCrashes.length > 3) {
      console.error('[telchar] renderer crash loop, giving up:', details.reason)
      return
    }
    console.error('[telchar] renderer gone, reloading:', details.reason)
    mainWindow?.webContents.reload()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app
  .whenReady()
  .then(async () => {
    if (!gotLock) return
    // Resolve login-shell PATH before any pty can spawn (macOS GUI PATH fix).
    await resolveShellEnv()
    // Hook listener must be up before the first pty spawns (env injection).
    // Failure degrades to no-attention-hooks; the app itself must still boot.
    try {
      await hookServer.start()
    } catch (err) {
      console.error('[telchar] hook server failed to start:', err)
    }
    // Dev runs show Electron's default dock icon (electron-builder's mac.icon
    // only applies to packaged builds); point the dock at the brand icon.
    // build/ is not shipped in the asar, so dev-only.
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'))
    }
    registerIpc(() => mainWindow)
    buildMenu(() => mainWindow)
    // Auto-surface plans even without hooks installed (see PlansDirWatcher).
    plansDirWatcher.start()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((err) => {
    dialog.showErrorBox('Telchar failed to start', String(err))
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Worktree edits don't touch .git — refresh git status when the user returns.
app.on('browser-window-focus', () => gitService.refreshAll())

app.on('before-quit', () => {
  // Second layer under the renderer's beforeunload flush: re-persist the last
  // state main has seen, in case the renderer never got to flush.
  flushStateSync()
  ptyManager.killAll()
  markdownWatcher.closeAll()
  plansDirWatcher.close()
  gitService.closeAll()
  worktreeWatcher.closeAll()
  hookServer.stop()
})
