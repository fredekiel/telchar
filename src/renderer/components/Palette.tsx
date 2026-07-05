// Command palette: ⌘P = quick-open (sessions + files across ALL projects),
// ⌘⇧P = commands. One cmdk overlay, two modes; every action nameable.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { FileText, TerminalSquare, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { useSearchHits } from '../search'
import { AttentionDot } from './AttentionDot'

interface CommandItem {
  id: string
  label: string
  hint?: string
  run: () => void
}

export function Palette() {
  const mode = useStore((s) => s.paletteOpen)
  const setPalette = useStore((s) => s.setPalette)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [mode])

  const hits = useSearchHits(query, mode === 'files')
  const commands = useCommands(mode === 'commands')

  if (!mode) return null
  const close = () => setPalette(false)

  return (
    <div className="absolute inset-0 z-50" onMouseDown={close}>
      <div
        className="mx-auto mt-16 w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-bgalt shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false} loop>
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={mode === 'files' ? 'Jump to session or file…' : 'Run command…'}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
            }}
            className="w-full border-b border-border bg-transparent px-4 py-3 text-fg outline-none placeholder:text-dim"
          />
          <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-4 text-dim">No matches.</Command.Empty>
            {mode === 'files' &&
              hits.map((hit) =>
                hit.kind === 'session' ? (
                  <Command.Item
                    key={`s:${hit.tab.id}`}
                    value={`s:${hit.tab.id}`}
                    onSelect={() => {
                      close()
                      useStore.getState().jumpToTab(hit.tab.id)
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 data-[selected=true]:bg-panel"
                  >
                    <TerminalSquare size={13} className="shrink-0 text-dim" />
                    <span className="min-w-0 flex-1 truncate">{hit.label}</span>
                    <AttentionDot tabId={hit.tab.id} kind={hit.tab.kind} />
                    <span className="text-[10px] text-dim">session</span>
                  </Command.Item>
                ) : (
                  <Command.Item
                    key={`f:${hit.absPath}`}
                    value={`f:${hit.absPath}`}
                    onSelect={() => {
                      close()
                      useStore.getState().openFile(hit.project, hit.absPath, hit.relPath.split('/').pop() ?? hit.relPath)
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 data-[selected=true]:bg-panel"
                  >
                    <FileText size={13} className="shrink-0 text-dim" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-dim">{hit.project.name}/</span>
                      {hit.relPath}
                    </span>
                  </Command.Item>
                )
              )}
            {mode === 'commands' &&
              commands
                .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
                .map((c) => (
                  <Command.Item
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      close()
                      c.run()
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 data-[selected=true]:bg-panel"
                  >
                    <ChevronRight size={13} className="shrink-0 text-dim" />
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="text-[10px] text-dim">{c.hint}</span>}
                  </Command.Item>
                ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

function useCommands(active: boolean): CommandItem[] {
  const projects = useStore((s) => s.state.projects)
  const layouts = useStore((s) => s.state.layouts)
  const activeLayoutId = useStore((s) => s.state.activeLayoutId)

  return useMemo(() => {
    if (!active) return []
    const s = () => useStore.getState()
    const items: CommandItem[] = [
      { id: 'new-layout', label: 'Layout: New', hint: '⌘⇧N', run: () => s().newLayout() },
      { id: 'toggle-sidebar', label: 'View: Toggle Sidebar', hint: '⌘B', run: () => s().toggleSidebar() },
      { id: 'overview', label: 'View: Session Overview', hint: '⌘O', run: () => s().setOverview(true) },
      { id: 'jump-attention', label: 'Jump to Needs-Input Session', hint: '⌘⇧A', run: () => s().jumpAttention() },
      { id: 'split-right', label: 'Pane: Split Right', hint: '⌘\\', run: () => s().splitActive('right') },
      { id: 'split-down', label: 'Pane: Split Down', hint: '⌘⌥\\', run: () => s().splitActive('below') },
      { id: 'add-project', label: 'Project: Add Folder…', run: () => void s().addProject() },
      { id: 'new-empty-tab', label: 'Pane: New Empty Tab', run: () => s().newEmptyTab() },
      { id: 'keybinds', label: 'Help: Keyboard Shortcuts', hint: '⌘/', run: () => s().setKeybinds(true) },
      {
        id: 'install-hooks',
        label: 'Claude: Install Attention Hooks (precise needs-input detection)',
        run: () =>
          void window.telchar.claude.installHooks().then((r) => {
            new Notification('Telchar', { body: `Claude hooks: ${r.detail}` })
          })
      }
    ]
    for (const p of projects) {
      items.push({
        id: `term:${p.id}`,
        label: `New Terminal: ${p.name}`,
        run: () => s().newTerminal(p)
      })
    }
    for (const l of layouts) {
      if (l.id !== activeLayoutId) {
        items.push({ id: `layout:${l.id}`, label: `Layout: Switch to "${l.name}"`, run: () => s().switchLayout(l.id) })
      }
      items.push({
        id: `move:${l.id}`,
        label: `Move Active Tab to Layout "${l.name}"`,
        run: () => {
          const st = s().state
          const layout = st.layouts.find((x) => x.id === st.activeLayoutId)
          if (layout?.activeTabId) s().moveTabToLayout(layout.activeTabId, l.id)
        }
      })
    }
    return items
  }, [active, projects, layouts, activeLayoutId])
}
