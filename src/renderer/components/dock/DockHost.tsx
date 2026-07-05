// Dock layer: one dockview instance per layout, all mounted, inactive ones
// hidden (display:none) so terminals survive layout switches instantly.
// Tab metadata lives in the store; dockview owns geometry; this file (plus
// adapter.ts) is the only dockview-aware code.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps
} from 'dockview-react'
import { Command } from 'cmdk'
import { Plus, Columns2, TerminalSquare, FileSearch, FileText, Anvil } from 'lucide-react'
import type { EmptyTab, PersistedTab } from '@shared/types'
import { useStore, selectedProject } from '../../store'
import { useRuntime } from '../../state/runtime'
import { addTabPanel, buildDefaultGrid, fromEnvelope, toEnvelope } from './adapter'
import { registerDock, type DockActions, type SplitDirection } from './dockActions'
import { TerminalView } from '../TerminalView'
import { TerminalFooter } from '../TerminalFooter'
import { PlanView } from '../PlanView'
import { FileView } from '../FileView'
import { AttentionDot } from '../AttentionDot'
import { ErrorBoundary } from '../ErrorBoundary'
import { Tooltip } from '../ui/Tooltip'
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from '../ui/Popover'
import { IconPicker } from '../IconPicker'
import { DecorIcon } from '../DecorIcon'
import {
  ColorSwatchRow,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from '../ui/ContextMenu'

const LayoutIdContext = createContext<string>('default')

const MIN_PANE = { minimumWidth: 240, minimumHeight: 160 }
const ENVELOPE_SAVE_DEBOUNCE_MS = 250

// ---- panel body ----

function TabBody(props: IDockviewPanelProps<{ tabId: string }>) {
  // Contain a pane crash to its own panel — the rest of the grid stays alive.
  return (
    <ErrorBoundary label="pane">
      <TabBodyInner {...props} />
    </ErrorBoundary>
  )
}

function TabBodyInner(props: IDockviewPanelProps<{ tabId: string }>) {
  const layoutId = useContext(LayoutIdContext)
  const tab = useStore((s) => s.state.tabs[props.params.tabId])
  const layoutActive = useStore((s) => s.state.activeLayoutId === layoutId)
  const [panelVisible, setPanelVisible] = useState(props.api.isVisible)

  useEffect(() => {
    const d = props.api.onDidVisibilityChange((e) => setPanelVisible(e.isVisible))
    return () => d.dispose()
  }, [props.api])

  if (!tab) return null
  const visible = panelVisible && layoutActive

  switch (tab.kind) {
    case 'terminal':
      // Footer stays mounted regardless of Claude state so the terminal
      // height is constant (no xterm reflow when segments appear).
      return (
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1">
            <TerminalView tab={tab} visible={visible} />
          </div>
          <TerminalFooter tab={tab} />
        </div>
      )
    case 'plan':
      return <PlanView tab={tab} />
    case 'file':
      return <FileView tab={tab} />
    case 'empty':
      return <EmptyTabView tab={tab} />
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

// ---- empty tab: placeholder until the user picks content ----

function EmptyTabView({ tab }: { tab: EmptyTab }) {
  const projects = useStore((s) => s.state.projects)
  const project = useStore((s) => selectedProject(s.state))

  // Convert in place: focus this tab's group so the replacement lands next to
  // it, run the action, drop the placeholder.
  const convert = (action: () => void) => {
    const s = useStore.getState()
    const layoutId = useRuntime.getState().tabLayout[tab.id] ?? s.state.activeLayoutId
    import('./dockActions').then(({ dockFor }) => {
      dockFor(layoutId)?.focusTab(tab.id)
      action()
      s.closeTab(tab.id)
    })
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg">
      <Anvil className="size-7 text-ember" />
      <div className="text-dim">Empty anvil — pick what to forge here</div>
      <div className="flex flex-col gap-2">
        {projects.slice(0, 4).map((p) => (
          <button
            key={p.id}
            onClick={() => convert(() => useStore.getState().newTerminal(p))}
            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-panel px-4 py-2.5 text-left hover:bg-panelhi"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 truncate">
              New terminal — <span className="font-semibold">{p.name}</span>
            </span>
            <TerminalSquare size={14} className="text-dim" />
          </button>
        ))}
        <button
          onClick={() => {
            useStore.getState().setPalette('files')
          }}
          className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-panel px-4 py-2.5 text-left hover:bg-panelhi"
        >
          <FileSearch size={14} className="text-dim" />
          <span className="flex-1">Open a file…</span>
          <span className="text-[10px] text-dim">⌘P</span>
        </button>
        {project && (
          <button
            onClick={() => useStore.getState().setSidebar({ view: 'plans', collapsed: false })}
            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-panel px-4 py-2.5 text-left hover:bg-panelhi"
          >
            <FileText size={14} className="text-dim" />
            <span className="flex-1">Browse plans…</span>
          </button>
        )}
      </div>
    </div>
  )
}

// Searchable project picker for spawning a terminal (or an empty tab) —
// shared by the per-pane "+" and the empty-layout "New terminal" card so
// both open the same menu.
function NewTerminalPicker({
  trigger,
  tooltip,
  onWillAction,
  matchTriggerWidth = false
}: {
  trigger: ReactElement
  tooltip?: string
  onWillAction?: () => void
  matchTriggerWidth?: boolean
}) {
  const projects = useStore((s) => s.state.projects)
  const [open, setOpen] = useState(false)

  const run = (action: () => void) => {
    onWillAction?.()
    action()
    setOpen(false)
  }

  const triggerEl = <PopoverTrigger asChild>{trigger}</PopoverTrigger>
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) onWillAction?.()
        setOpen(o)
      }}
    >
      {tooltip ? (
        <Tooltip label={tooltip} side="bottom">
          {triggerEl}
        </Tooltip>
      ) : (
        triggerEl
      )}
      <PopoverContent matchTriggerWidth={matchTriggerWidth}>
        <Command loop>
          <Command.Input
            autoFocus
            placeholder="New terminal — find project…"
            className="w-full border-b border-border bg-transparent px-3.5 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim"
          />
          <Command.List className="max-h-[40vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-4 text-dim">No matching project.</Command.Empty>
            {projects.map((p) => (
              <Command.Item
                key={p.id}
                value={`${p.name} ${p.id}`}
                onSelect={() => run(() => useStore.getState().newTerminal(p))}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] select-none data-[selected=true]:bg-panelhi"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <TerminalSquare size={14} className="shrink-0 text-dim" />
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        {/* Plain button outside cmdk: never filtered away, Enter can't hit it. */}
        <button
          onClick={() => run(() => useStore.getState().newEmptyTab())}
          className="flex w-full cursor-pointer items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-[13px] text-dim hover:bg-panelhi hover:text-fg"
        >
          <Plus size={14} />
          Empty tab (choose content)…
        </button>
      </PopoverContent>
    </Popover>
  )
}

// Per-pane "+" — the new terminal lands in THAT pane (group is focused
// before the store action routes to the active group).
function GroupAddButton(props: IDockviewHeaderActionsProps) {
  const focusGroup = () => {
    try {
      props.group.focus()
      props.group.activePanel?.api.setActive()
    } catch {
      /* focus best-effort */
    }
  }

  return (
    <div className="flex h-full items-center">
      <NewTerminalPicker
        tooltip="New terminal in this pane"
        onWillAction={focusGroup}
        trigger={
          <button className="flex h-full cursor-pointer items-center justify-center px-2.5 text-dim hover:bg-panelhi hover:text-fg">
            <Plus size={14} />
          </button>
        }
      />
    </div>
  )
}

// Per-pane split — right side of the tab strip, next to where the new pane
// appears. Click = split right, ⌥-click = split down (VSCode convention).
function GroupSplitButton(props: IDockviewHeaderActionsProps) {
  const split = (e: React.MouseEvent) => {
    try {
      // focus this group so splitActive resolves project/cwd + activeGroup to it
      props.group.focus()
      props.group.activePanel?.api.setActive()
    } catch {
      /* focus best-effort */
    }
    useStore.getState().splitActive(e.altKey ? 'below' : 'right')
  }

  return (
    <div className="flex h-full items-center">
      <Tooltip side="bottom" label="Split right (⌥-click for down) — new terminal, same directory">
        <button
          onClick={split}
          className="flex h-full cursor-pointer items-center justify-center px-2.5 text-dim hover:bg-panelhi hover:text-fg"
        >
          <Columns2 size={14} />
        </button>
      </Tooltip>
    </div>
  )
}

// ---- custom tab header ----

function TabHeader(props: IDockviewPanelHeaderProps<{ tabId: string }>) {
  const tabId = props.params.tabId
  const layoutId = useContext(LayoutIdContext)
  const tab = useStore((s) => s.state.tabs[tabId])
  const color = useStore((s) => s.state.projects.find((p) => p.id === tab?.projectId)?.color)
  const layouts = useStore((s) => s.state.layouts)
  const runtime = useRuntime((s) => s.byTab[tabId])
  const closeTab = useStore((s) => s.closeTab)
  const renameTab = useStore((s) => s.renameTab)
  const setTabColor = useStore((s) => s.setTabColor)
  const setTabIcon = useStore((s) => s.setTabIcon)
  const unpinTabTitle = useStore((s) => s.unpinTabTitle)
  const moveTabToLayout = useStore((s) => s.moveTabToLayout)
  const [editing, setEditing] = useState<false | 'title'>(false)
  const [draft, setDraft] = useState('')
  const [iconOpen, setIconOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // The tint/stripe lives on dockview's .dv-tab cell (the parent that also
  // carries active/hover state) — stamp a CSS var + attr; styles.css renders it.
  const tabColor = tab?.color
  useLayoutEffect(() => {
    const cell = rootRef.current?.closest<HTMLElement>('.dv-tab')
    if (!cell || !tabColor) return
    cell.style.setProperty('--tab-color', tabColor)
    cell.setAttribute('data-tab-color', '')
    return () => {
      cell.style.removeProperty('--tab-color')
      cell.removeAttribute('data-tab-color')
    }
  }, [tabColor])

  if (!tab) return null
  const pinned = tab.kind === 'terminal' && tab.titlePinned
  const title = (!pinned && tab.kind === 'terminal' && runtime?.oscTitle) || tab.title
  const otherLayouts = layouts.filter((l) => l.id !== layoutId)
  const groupPanels = props.containerApi.getPanel(tabId)?.group?.panels ?? []

  const commit = () => {
    if (editing === 'title') renameTab(tabId, draft)
    setEditing(false)
  }

  if (editing) {
    return (
      <div ref={rootRef} className="flex h-full items-center px-2" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
            e.stopPropagation()
          }}
          className="w-32 rounded border border-border bg-bg px-1 text-[12px] text-fg outline-none focus:border-accent"
        />
      </div>
    )
  }

  const closeOthers = () => {
    for (const p of [...groupPanels]) if (p.id !== tabId) closeTab(p.id)
  }

  // Geometry-only: tear THIS tab out into a new adjacent group. Persisted via
  // the usual onDidLayoutChange → envelope debounce; tabs map untouched.
  const splitTabOut = (position: 'right' | 'bottom') => {
    const panel = props.containerApi.getPanel(tabId)
    if (panel?.group) panel.api.moveTo({ group: panel.group, position })
  }

  return (
    <Popover open={iconOpen} onOpenChange={setIconOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <div
              ref={rootRef}
              className="group flex h-full max-w-[220px] min-w-[110px] items-center gap-1.5 px-3 text-[12px]"
              title={`${tab.kind === 'terminal' ? tab.cwd : 'path' in tab ? tab.path : ''} — double-click to rename`}
              onDoubleClick={(e) => {
                e.stopPropagation() // keep dockview's group-maximize dblclick away
                setDraft(tab.title)
                setEditing('title')
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closeTab(tabId)
                }
              }}
            >
              {tab.icon ? (
                <DecorIcon icon={tab.icon} color={tab.color} size={13} />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color ?? 'var(--color-dim)' }} />
              )}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <AttentionDot tabId={tabId} kind={tab.kind} />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tabId)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-dim opacity-0 hover:bg-panelhi hover:text-fg group-hover:opacity-100"
                title="Close tab"
              >
                ×
              </button>
            </div>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ColorSwatchRow value={tab.color} onPick={(c) => setTabColor(tabId, c)} />
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              setDraft(tab.title)
              setEditing('title')
            }}
          >
            Rename…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setIconOpen(true)}>Set icon…</ContextMenuItem>
          {tab.icon && <ContextMenuItem onSelect={() => setTabIcon(tabId, undefined)}>Remove icon</ContextMenuItem>}
          {pinned && <ContextMenuItem onSelect={() => unpinTabTitle(tabId)}>Unpin title</ContextMenuItem>}
          <ContextMenuSeparator />
          <ContextMenuItem disabled={groupPanels.length <= 1} onSelect={() => splitTabOut('right')}>
            Split right
          </ContextMenuItem>
          <ContextMenuItem disabled={groupPanels.length <= 1} onSelect={() => splitTabOut('bottom')}>
            Split down
          </ContextMenuItem>
          <ContextMenuSeparator />
          {otherLayouts.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Move to layout</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {otherLayouts.map((l) => (
                  <ContextMenuItem key={l.id} onSelect={() => moveTabToLayout(tabId, l.id)}>
                    {l.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          <ContextMenuItem disabled={groupPanels.length <= 1} onSelect={closeOthers}>
            Close others
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => closeTab(tabId)}>Close</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent matchTriggerWidth={false} className="w-[324px]">
        <IconPicker
          value={tab.icon}
          color={tab.color}
          onPick={(icon) => {
            setTabIcon(tabId, icon)
            setIconOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

const panelComponents = { tabBody: TabBody }
const tabComponents = { tabHeader: TabHeader }

// ---- per-layout host ----

// flushPendingEnvelope closes over the listener effect's debounce timer, so
// the registration site supplies it.
function makeActions(api: DockviewApi): Omit<DockActions, 'flushPendingEnvelope'> {
  return {
    addTabPanel: (tab: PersistedTab, split?: SplitDirection) => addTabPanel(api, tab, split),
    removeTabPanel: (tabId) => {
      const panel = api.getPanel(tabId)
      if (panel) api.removePanel(panel)
    },
    focusTab: (tabId) => {
      const panel = api.getPanel(tabId)
      panel?.api.setActive()
      panel?.focus()
    },
    focusPane: (index) => {
      const group = api.groups[index - 1]
      group?.focus()
      group?.activePanel?.api.setActive()
    },
    focusPaneDelta: (delta) => {
      const groups = api.groups
      if (groups.length === 0) return
      const i = groups.findIndex((g) => g === api.activeGroup)
      const next = groups[(((i < 0 ? 0 : i) + delta) % groups.length + groups.length) % groups.length]
      next.focus()
      next.activePanel?.api.setActive()
    },
    cycleTab: (delta) => {
      const group = api.activeGroup
      if (!group) return
      const panels = group.panels
      if (panels.length < 2) return
      const i = panels.findIndex((p) => p === group.activePanel)
      const next = panels[(((i < 0 ? 0 : i) + delta) % panels.length + panels.length) % panels.length]
      next.api.setActive()
    },
    toggleMaximize: () => {
      try {
        if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
        else if (api.activePanel) api.maximizeGroup(api.activePanel)
      } catch {
        /* maximize unsupported — ignore */
      }
    },
    panelIds: () => api.panels.map((p) => p.id)
  }
}

function applyConstraints(api: DockviewApi): void {
  for (const group of api.groups) {
    try {
      group.api.setConstraints(MIN_PANE)
    } catch {
      /* constraints API drift — non-fatal */
    }
  }
}

export function DockHost({ layoutId }: { layoutId: string }) {
  const [api, setApi] = useState<DockviewApi | null>(null)
  const [panelCount, setPanelCount] = useState(0)
  const initedRef = useRef(false)
  const active = useStore((s) => s.state.activeLayoutId === layoutId)
  const tabs = useStore((s) => s.state.tabs)
  const pending = useStore((s) => s.pendingPlacement)

  // Init once per dockview instance: restore envelope or build default grid.
  useEffect(() => {
    if (!api || initedRef.current) return
    initedRef.current = true

    const store = useStore.getState()
    const layout = store.state.layouts.find((l) => l.id === layoutId)
    const known = new Set(Object.keys(store.state.tabs))
    const restored = layout?.dock ? fromEnvelope(api, layout.dock, known) : false
    if (!restored) {
      // dock:null (fresh/migrated) or corrupt/incompatible envelope: build a
      // one-group grid from tabs claimed by this layout.
      const claimed = Object.values(store.state.tabs).filter(
        (t) => store.pendingPlacement[t.id]?.layoutId === layoutId
      )
      // The active layout also adopts every unplaced tab (migration path).
      const adopted =
        store.state.activeLayoutId === layoutId
          ? store.unplacedTabIds().map((id) => store.state.tabs[id])
          : []
      buildDefaultGrid(api, [...claimed, ...adopted].filter(Boolean))
    }
    applyConstraints(api)
    useRuntime.getState().setTabLayout(layoutId, api.panels.map((p) => p.id))
    setPanelCount(api.panels.length)

    // Restore the layout's active tab.
    const activeTabId = layout?.activeTabId
    if (activeTabId) api.getPanel(activeTabId)?.api.setActive()
  }, [api, layoutId])

  // Wire listeners (separate effect so cleanup runs on unmount).
  useEffect(() => {
    if (!api) return
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    registerDock(layoutId, {
      ...makeActions(api),
      flushPendingEnvelope: () => {
        if (!saveTimer) return
        clearTimeout(saveTimer)
        saveTimer = null
        useStore.getState().setDockEnvelope(layoutId, toEnvelope(api))
      }
    })

    const disposables = [
      api.onDidLayoutChange(() => {
        applyConstraints(api)
        useRuntime.getState().setTabLayout(layoutId, api.panels.map((p) => p.id))
        setPanelCount(api.panels.length)
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          useStore.getState().setDockEnvelope(layoutId, toEnvelope(api))
        }, ENVELOPE_SAVE_DEBOUNCE_MS)
      }),
      api.onDidActivePanelChange((e) => {
        const panelId = e.panel?.id
        if (panelId) {
          useStore.getState().setActiveInLayout(layoutId, panelId)
          useRuntime.getState().clearAttention(panelId)
        }
      }),
      // dragstart targets dockview's draggable .dv-tab wrapper, so a handler
      // on the tab CONTENT (a child) never sees it — stamp the tabId here so
      // layout tabs in the title bar can accept cross-layout drops.
      api.onWillDragPanel((e) => {
        if (e.nativeEvent instanceof DragEvent && e.nativeEvent.dataTransfer) {
          e.nativeEvent.dataTransfer.setData('telchar/tab', e.panel.id)
        }
      })
    ]

    return () => {
      if (saveTimer) clearTimeout(saveTimer)
      for (const d of disposables) d.dispose()
      registerDock(layoutId, null)
    }
  }, [api, layoutId])

  // Reconcile: panels must mirror the tabs map + placements.
  useEffect(() => {
    if (!api || !initedRef.current) return
    const store = useStore.getState()
    // Add panels for tabs placed into this layout. Placements are claimed
    // even when the panel already exists — the store thunks add panels
    // imperatively in the same tick, and unclaimed entries would leak.
    for (const tab of Object.values(tabs)) {
      const placement = pending[tab.id]
      if (placement?.layoutId === layoutId) {
        if (!api.getPanel(tab.id)) addTabPanel(api, tab, placement.split)
        store.claimPlacement(tab.id)
        continue
      }
      if (api.getPanel(tab.id)) continue
      if (!placement && active) {
        // Active layout adopts unplaced tabs (crash-window orphans).
        if (store.unplacedTabIds().includes(tab.id)) addTabPanel(api, tab)
      }
    }
    // Remove panels whose tab metadata is gone.
    for (const panel of [...api.panels]) {
      if (!tabs[panel.id]) api.removePanel(panel)
    }
    setPanelCount(api.panels.length)
  }, [api, tabs, pending, active, layoutId])

  return (
    <div className="absolute inset-0" style={{ display: active ? 'block' : 'none' }}>
      <LayoutIdContext.Provider value={layoutId}>
        <DockviewReact
          className="dockview-theme-abyss telchar-dock"
          components={panelComponents}
          tabComponents={tabComponents}
          leftHeaderActionsComponent={GroupAddButton}
          rightHeaderActionsComponent={GroupSplitButton}
          onReady={(e: DockviewReadyEvent) => setApi(e.api)}
        />
      </LayoutIdContext.Provider>
      {panelCount === 0 && <LayoutEmptyState />}
    </div>
  )
}

// Empty layout: quick actions instead of a black void. (Zero projects never
// reaches here — App renders the full-window add-project takeover instead.)
function LayoutEmptyState() {
  const project = useStore((s) => selectedProject(s.state))
  const { setPalette } = useStore()
  if (!project) return null

  return (
    // z-10: must sit above dockview's dv-watermark-container (z-index: 1), which
    // otherwise swallows all pointer events on the empty grid.
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg">
      <div className="flex w-72 flex-col gap-2">
        <Anvil className="mx-auto size-7 text-ember" />
        <div className="pb-1 text-center text-dim">This forge sits empty</div>
        <NewTerminalPicker
          matchTriggerWidth
          trigger={
            <button className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-panel px-4 py-2.5 text-left hover:bg-panelhi">
              <TerminalSquare size={14} className="shrink-0 text-dim" />
              <span className="flex-1">New terminal…</span>
              <span className="text-[10px] text-dim">⌘T</span>
            </button>
          }
        />
        <button
          onClick={() => setPalette('files')}
          className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border bg-panel px-4 py-2.5 text-left hover:bg-panelhi"
        >
          <FileSearch size={14} className="text-dim" />
          <span className="flex-1">Open a file…</span>
          <span className="text-[10px] text-dim">⌘P</span>
        </button>
        <div className="pt-1 text-center text-[11px] text-dim">
          …or drag a tab from another layout onto this layout's name.
        </div>
      </div>
    </div>
  )
}

// All layouts stacked; only the active one visible.
export function DockRoot() {
  const layoutIds = useStore((s) => s.state.layouts.map((l) => l.id))
  return (
    <div className="relative min-h-0 flex-1">
      {layoutIds.map((id) => (
        <DockHost key={id} layoutId={id} />
      ))}
    </div>
  )
}
