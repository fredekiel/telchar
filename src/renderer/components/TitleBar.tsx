// Title bar spanning only the content column: layout tabs start flush with the
// content area's left edge (the sidebar rail sits beside it, full height).
// leftInset reserves traffic-light space when no rail is wide enough to cover it.

import { useState } from 'react'
import { Plus, X, LayoutGrid, Minus, Square } from 'lucide-react'
import { useStore } from '../store'
import { useRuntime, needsInputQueue } from '../state/runtime'
import { Tooltip } from './ui/Tooltip'
import {
  ColorSwatchRow,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from './ui/ContextMenu'
import { Popover, PopoverAnchor, PopoverContent } from './ui/Popover'
import { IconPicker } from './IconPicker'
import { DecorIcon } from './DecorIcon'

export const TRAFFIC_LIGHT_W = 76
export const ACTIVITY_BAR_W = 52

export function TitleBar({ leftInset = 0 }: { leftInset?: number }) {
  const layouts = useStore((s) => s.state.layouts)
  const activeLayoutId = useStore((s) => s.state.activeLayoutId)
  const { switchLayout, newLayout, setOverview } = useStore()
  const attention = useRuntime((s) => needsInputQueue(s.byTab).length)

  return (
    <div
      className="relative flex h-11 shrink-0 items-center border-b border-border bg-bgalt pr-2"
      style={{ WebkitAppRegion: 'drag', paddingLeft: leftInset } as React.CSSProperties}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pl-2">
        {layouts.map((l) => (
          <LayoutTab
            key={l.id}
            layoutId={l.id}
            name={l.name}
            color={l.color}
            icon={l.icon}
            active={l.id === activeLayoutId}
            onSelect={() => switchLayout(l.id)}
          />
        ))}
        <Tooltip label="New layout — ⌘⇧N" side="bottom">
          <button
            onClick={newLayout}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-md px-2 text-dim hover:bg-panel hover:text-fg"
          >
            <Plus size={15} />
          </button>
        </Tooltip>
      </div>
      <Tooltip label="Session overview — ⌘O" side="bottom">
        <button
          onClick={() => setOverview(true)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-dim hover:bg-panel hover:text-fg"
        >
          <LayoutGrid size={15} />
          {attention > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black">
              {attention}
            </span>
          )}
        </button>
      </Tooltip>
      {window.telchar?.platform !== 'darwin' && <WindowControls />}
    </div>
  )
}

// Windows/Linux window controls. macOS uses native traffic lights, so this
// only renders off-mac (see the frameless titleBarStyle in main/index.ts).
function WindowControls() {
  const { minimize, toggleMaximize, close } = window.telchar.window
  const btn =
    'flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center text-dim hover:bg-panel hover:text-fg'
  return (
    <div
      className="-mr-2 flex shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button className={btn} onClick={() => minimize()} title="Minimize" aria-label="Minimize">
        <Minus size={15} />
      </button>
      <button className={btn} onClick={() => toggleMaximize()} title="Maximize" aria-label="Maximize">
        <Square size={12} />
      </button>
      <button
        className={btn + ' hover:!bg-red-600 hover:!text-white'}
        onClick={() => close()}
        title="Close"
        aria-label="Close"
      >
        <X size={16} />
      </button>
    </div>
  )
}

function LayoutTab({
  layoutId,
  name,
  color,
  icon,
  active,
  onSelect
}: {
  layoutId: string
  name: string
  color?: string
  icon?: string
  active: boolean
  onSelect: () => void
}) {
  const { renameLayout, deleteLayout, moveTabToLayout, setLayoutColor, setLayoutIcon } = useStore()
  const layoutCount = useStore((s) => s.state.layouts.length)
  const attention = useRuntime((s) => {
    let n = 0
    for (const [tabId, l] of Object.entries(s.tabLayout)) {
      if (l === layoutId && s.byTab[tabId]?.attention === 'needs-input') n++
    }
    return n
  })
  const [editing, setEditing] = useState<false | 'title'>(false)
  const [draft, setDraft] = useState(name)
  const [iconOpen, setIconOpen] = useState(false)
  const [dropHover, setDropHover] = useState(false)

  const commit = () => {
    if (editing === 'title') renameLayout(layoutId, draft)
    setEditing(false)
  }

  const confirmDelete = () => {
    const owned = Object.entries(useRuntime.getState().tabLayout).filter(([, l]) => l === layoutId)
    if (owned.length === 0 || window.confirm(`Delete layout "${name}" and close its ${owned.length} tab(s)?`)) {
      deleteLayout(layoutId)
    }
  }

  // Colored pills mix the tint into theme tokens (opaque, theme-adaptive);
  // the stripe is an inset shadow so it follows the pill's rounded corners.
  const surface = color
    ? active
      ? 'bg-[color-mix(in_srgb,var(--tab-color)_22%,var(--color-panel))] text-fg shadow-[inset_0_2px_0_0_var(--tab-color)]'
      : 'text-dim hover:text-fg bg-[color-mix(in_srgb,var(--tab-color)_10%,var(--color-bgalt))] hover:bg-[color-mix(in_srgb,var(--tab-color)_16%,var(--color-panel))] shadow-[inset_0_2px_0_0_color-mix(in_srgb,var(--tab-color)_55%,transparent)]'
    : active
      ? 'bg-panel text-fg shadow-[inset_0_2px_0_0_var(--color-ember)]'
      : 'text-dim hover:bg-panel/60 hover:text-fg'

  return (
    <Popover open={iconOpen} onOpenChange={setIconOpen}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <PopoverAnchor asChild>
            <div
              onClick={onSelect}
              onDoubleClick={() => {
                setDraft(name)
                setEditing('title')
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('telchar/tab')) return
                e.preventDefault()
                setDropHover(true)
              }}
              onDragLeave={() => setDropHover(false)}
              onDrop={(e) => {
                setDropHover(false)
                const tabId = e.dataTransfer.getData('telchar/tab')
                if (tabId && useStore.getState().state.tabs[tabId]) {
                  e.preventDefault()
                  moveTabToLayout(tabId, layoutId)
                }
              }}
              style={{ WebkitAppRegion: 'no-drag', '--tab-color': color } as React.CSSProperties}
              className={
                'group flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3.5 text-[13px] font-semibold ' +
                surface +
                (dropHover ? ' ring-1 ring-accent' : '')
              }
              title="Double-click to rename · drop a tab here to move it"
            >
              {editing ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') setEditing(false)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-24 rounded border border-border bg-bg px-1 text-fg outline-none focus:border-accent"
                />
              ) : (
                <>
                  {icon && <DecorIcon icon={icon} color={color} size={14} />}
                  <span className="max-w-[140px] truncate">{name}</span>
                </>
              )}
              {attention > 0 && (
                <span className="flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black">
                  {attention}
                </span>
              )}
              {layoutCount > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    confirmDelete()
                  }}
                  className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-dim opacity-0 hover:bg-panelhi hover:text-fg group-hover:opacity-100"
                  title="Delete layout"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ColorSwatchRow value={color} onPick={(c) => setLayoutColor(layoutId, c)} />
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              setDraft(name)
              setEditing('title')
            }}
          >
            Rename…
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setIconOpen(true)}>Set icon…</ContextMenuItem>
          {icon && <ContextMenuItem onSelect={() => setLayoutIcon(layoutId, undefined)}>Remove icon</ContextMenuItem>}
          {layoutCount > 1 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={confirmDelete}>Close</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <PopoverContent matchTriggerWidth={false} className="w-[324px]">
        <IconPicker
          value={icon}
          color={color}
          onPick={(i) => {
            setLayoutIcon(layoutId, i)
            setIconOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
