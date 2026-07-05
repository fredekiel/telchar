import { useEffect } from 'react'
import { TriangleAlert, X, Anvil, Flame } from 'lucide-react'
import { useStore, type LoadNotice } from './store'
import { useRuntime, needsInputQueue, pickClaudeSessionFields } from './state/runtime'
import { activeLayout } from './state/reducers'
import { dockFor } from './components/dock/dockActions'
import { ActivityBar } from './components/ActivityBar'
import { SidebarPanel } from './components/SidebarPanel'
import { TitleBar, TRAFFIC_LIGHT_W, ACTIVITY_BAR_W } from './components/TitleBar'
import { DockRoot } from './components/dock/DockHost'
import { StatusBar } from './components/StatusBar'
import { Overview } from './components/Overview'
import { Palette } from './components/Palette'
import { KeybindsHelp } from './components/KeybindsHelp'
import { Settings } from './components/Settings'
import { TooltipProvider } from './components/ui/Tooltip'
import { useThemeController } from './theme'

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const load = useStore((s) => s.load)
  // Pre-hydration the default 'system' pref resolves against the OS; the CSS
  // default (dark tokens) means a dark OS never flashes.
  useThemeController()

  useEffect(() => {
    void load()
  }, [load])

  // Git status pushes land in the runtime store.
  useEffect(() => {
    return window.telchar.git.onStatus((status) => useRuntime.getState().applyGit(status))
  }, [])

  // Claude lifecycle hooks (precise attention). Notification = claude waits on
  // the user; Stop = response finished — both worth a glance. Desktop-notify
  // only when the app is backgrounded.
  useEffect(() => {
    return window.telchar.claude.onHook((msg) => {
      const s = useStore.getState()
      const tab = s.state.tabs[msg.tabId]
      if (!tab) return
      // Every event's payload carries session_id/transcript_path — keep the
      // tab→session mapping fresh, and (re)resolve plan/tokens at the moments
      // they can change: session start, response end, and Notification (fired
      // when Claude presents a plan for approval).
      const fields = pickClaudeSessionFields(msg.payload)
      if (fields) {
        useRuntime.getState().setClaudeSession(msg.tabId, fields)
        if (
          (msg.event === 'SessionStart' || msg.event === 'Stop' || msg.event === 'Notification') &&
          fields.transcriptPath
        ) {
          void window.telchar.claude
            .sessionInfo({ transcriptPath: fields.transcriptPath })
            .then((info) => {
              useRuntime.getState().setClaudeSession(msg.tabId, info)
              // SessionStart only seeds the baseline (never auto-opens a plan
              // carried over from a resumed transcript); Stop/Notification may open.
              s.surfacePlanForTab(msg.tabId, { seedOnly: msg.event === 'SessionStart' })
            })
        }
      }
      if (msg.event === 'SessionStart') return // lifecycle only — no attention
      useRuntime.getState().markNeedsInput(msg.tabId)
      if (!document.hasFocus()) {
        const project = s.state.projects.find((p) => p.id === tab.projectId)
        const title = msg.event === 'Stop' ? 'Claude finished' : 'Claude needs input'
        try {
          new Notification(title, { body: `${project?.name ?? ''} — ${tab.title}`, silent: false })
        } catch {
          /* notifications unavailable */
        }
      }
    })
  }, [])

  // Hook-independent plan surfacing: the ~/.claude/plans dir watcher fires
  // whenever a plan .md is written (works with plain `claude`, no hooks needed —
  // plan-mode hook timing is unreliable). Re-resolve each running-claude tab and
  // open ONLY the plan that just changed, for the tab whose transcript owns it
  // (basename match) — precise attribution, no stale pop-ups. surfacePlanForTab
  // dedups so it opens once per plan and never reopens after close.
  useEffect(() => {
    return window.telchar.markdown.onPlansChanged((msg) => {
      const changed = msg.path.split('/').pop()
      if (!changed) return
      const s = useStore.getState()
      for (const [tabId, r] of Object.entries(useRuntime.getState().byTab)) {
        if (!r.isClaude) continue
        const tab = s.state.tabs[tabId]
        if (tab?.kind !== 'terminal') continue
        const opts = r.claude?.transcriptPath
          ? { transcriptPath: r.claude.transcriptPath }
          : { projectPath: tab.cwd }
        void window.telchar.claude.sessionInfo(opts).then((info) => {
          useRuntime.getState().setClaudeSession(tabId, info)
          if (info.planPath && info.planPath.split('/').pop() === changed) {
            s.surfacePlanForTab(tabId)
          }
        })
      }
    })
  }, [])

  // Dock badge mirrors the needs-input count.
  const needsInput = useRuntime((s) => needsInputQueue(s.byTab).length)
  useEffect(() => {
    window.telchar.app.setBadge(needsInput)
  }, [needsInput])

  // Single global pty status subscription: runtime store + the persisted
  // wasRunningClaude bridge (renderer owns persisted state — principle 1).
  useEffect(() => {
    return window.telchar.pty.onStatus((msg) => {
      useRuntime.getState().applyStatus(msg)
      if (msg.isClaude !== undefined) {
        const s = useStore.getState()
        const tab = s.state.tabs[msg.tabId]
        if (tab?.kind === 'terminal' && (tab.wasRunningClaude ?? false) !== msg.isClaude) {
          s.setTabClaudeFlag(msg.tabId, msg.isClaude)
        }
      }
    })
  }, [])

  // Menu accelerators -> actions. Geometry ops go through the active layout's
  // dock bridge; metadata ops through the store.
  useEffect(() => {
    return window.telchar.onShortcut((action) => {
      const s = useStore.getState()
      const dock = () => dockFor(s.state.activeLayoutId)
      switch (action.type) {
        case 'new-terminal':
          return s.newTerminalSelectedProject()
        case 'close-tab':
          return s.closeActiveTab()
        case 'next-tab':
          return dock()?.cycleTab(1)
        case 'prev-tab':
          return dock()?.cycleTab(-1)
        case 'focus-pane':
          return dock()?.focusPane(action.index)
        case 'split-right':
          return s.splitActive('right')
        case 'split-down':
          return s.splitActive('below')
        case 'maximize-pane':
          return dock()?.toggleMaximize()
        case 'toggle-sidebar':
          return s.toggleSidebar()
        case 'quick-open':
          return s.setPalette('files')
        case 'command-palette':
          return s.setPalette('commands')
        case 'toggle-overview':
          return s.setOverview(!s.overviewOpen)
        case 'jump-attention':
          return s.jumpAttention()
        case 'next-layout':
          return s.cycleLayout(1)
        case 'prev-layout':
          return s.cycleLayout(-1)
        case 'new-layout':
          return s.newLayout()
        case 'keybinds':
          return s.setKeybinds(!s.keybindsOpen)
      }
    })
  }, [])

  // Focus follows layout switches: re-focus the active tab's panel.
  const activeLayoutId = useStore((s) => s.state.activeLayoutId)
  useEffect(() => {
    const s = useStore.getState()
    const tabId = activeLayout(s.state).activeTabId
    if (tabId) dockFor(activeLayoutId)?.focusTab(tabId)
  }, [activeLayoutId])

  const hasProjects = useStore((s) => s.state.projects.length > 0)
  const sidebar = useStore((s) => s.state.sidebar)

  if (!hydrated)
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <Flame className="size-6 animate-pulse text-ember" />
      </div>
    )

  // Traffic lights only exist on macOS; off-mac there is nothing to inset past.
  const isMac = window.telchar?.platform === 'darwin'

  // Zero projects: the whole window is one empty state — the app requires a
  // selected project, so nothing else is usable until a folder is added.
  if (!hasProjects) {
    return (
      <TooltipProvider>
        <div className="flex h-full flex-col">
          <TitleBar leftInset={isMac ? TRAFFIC_LIGHT_W : 0} />
          <LoadNoticeBanner />
          <NoProjectsState />
        </div>
      </TooltipProvider>
    )
  }

  // The left rail (activity bar + sidebar) runs full height and hosts the
  // traffic lights; the title bar only spans the content column, so layout
  // tabs stay flush with the content edge as the sidebar resizes. When the
  // sidebar collapses the rail narrows past the traffic lights — inset the
  // title bar by the overhang.
  const railWidth = ACTIVITY_BAR_W + (sidebar.collapsed ? 0 : sidebar.width)
  const titleInset = isMac ? Math.max(0, TRAFFIC_LIGHT_W - railWidth) : 0

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <LoadNoticeBanner />
        <div className="flex min-h-0 flex-1">
          <div className="flex shrink-0 flex-col border-r border-border bg-bgalt">
            {/* Traffic-light zone: empty drag strip, keeps native dblclick-zoom. */}
            <div className="h-11 shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
            <div className="flex min-h-0 flex-1">
              <ActivityBar />
              <SidebarPanel />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <TitleBar leftInset={titleInset} />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <DockRoot />
              <Overview />
              <Palette />
              <KeybindsHelp />
              <Settings />
            </div>
          </div>
        </div>
        <StatusBar />
      </div>
    </TooltipProvider>
  )
}

function noticeText(notice: LoadNotice): string {
  switch (notice.kind) {
    case 'corrupt-reset':
      return 'The workspace file could not be read and was reset.'
    case 'newer-version-reset':
      return 'The workspace was saved by a newer Telchar version and was reset.'
    case 'load-failed':
      return 'The workspace failed to load — running with a temporary blank workspace. Nothing will be saved this session; your data on disk is untouched.'
  }
}

// Recovery is never silent: when persistence had to reset (or loading failed
// outright), say so and point at the backup instead of a blank welcome screen.
function LoadNoticeBanner() {
  const notice = useStore((s) => s.loadNotice)
  const dismiss = useStore((s) => s.dismissLoadNotice)
  if (!notice) return null
  return (
    <div className="flex items-center gap-2 border-b border-border bg-panel px-3 py-2 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate text-fg" title={noticeText(notice)}>
        {noticeText(notice)}
        {notice.backupPath && <span className="text-dim"> Backup: {notice.backupPath}</span>}
      </span>
      <button
        onClick={dismiss}
        className="shrink-0 cursor-pointer rounded p-0.5 text-dim hover:bg-panelhi hover:text-fg"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function NoProjectsState() {
  const addProject = useStore((s) => s.addProject)
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-bg">
      <Anvil className="size-9 text-ember" />
      <div className="text-lg font-semibold text-fg">The forge is cold</div>
      <div className="text-dim">Add a project folder to light it and start running Claude Code sessions.</div>
      <button
        onClick={() => void addProject()}
        className="cursor-pointer rounded-md bg-accent px-5 py-2 font-semibold text-bg hover:bg-accent/85"
      >
        Add project folder
      </button>
    </div>
  )
}
