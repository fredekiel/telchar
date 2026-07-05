// Searchable project selector — the app's single project switcher. Sits at
// the top of the sidebar; the selected project drives every sidebar view,
// the status bar and ⌘T.

import { useState } from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, FolderPlus } from 'lucide-react'
import { useStore, selectedProject } from '../store'
import { Popover, PopoverTrigger, PopoverContent } from './ui/Popover'

export function ProjectCombobox() {
  const projects = useStore((s) => s.state.projects)
  const selected = useStore((s) => selectedProject(s.state))
  const { selectProject, addProject } = useStore()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Switch project"
          className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-bg px-3 text-[13px] font-medium text-fg outline-none hover:border-accent/40 hover:bg-panel focus-visible:border-accent"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected?.color }} />
          <span className="min-w-0 flex-1 truncate text-left">{selected?.name}</span>
          <ChevronsUpDown size={14} className="shrink-0 text-dim" />
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <Command loop>
          <Command.Input
            autoFocus
            placeholder="Switch project…"
            className="w-full border-b border-border bg-transparent px-3.5 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim"
          />
          <Command.List className="max-h-[40vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-4 text-dim">No matching project.</Command.Empty>
            {projects.map((p) => (
              <Command.Item
                key={p.id}
                // id suffix keeps cmdk values unique when two projects share a name
                value={`${p.name} ${p.id}`}
                onSelect={() => {
                  selectProject(p.id)
                  setOpen(false)
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-[13px] select-none data-[selected=true]:bg-panelhi"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.id === selected?.id && <Check size={14} className="shrink-0 text-accent" />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        {/* Plain button outside cmdk: never filtered away, Enter can't hit it. */}
        <button
          onClick={() => {
            setOpen(false)
            void addProject()
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 border-t border-border px-3.5 py-2.5 text-[13px] text-dim hover:bg-panelhi hover:text-fg"
        >
          <FolderPlus size={14} />
          Add project folder…
        </button>
      </PopoverContent>
    </Popover>
  )
}
