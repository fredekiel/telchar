// Keyboard shortcut reference (⌘/ or the keyboard icon). Static — mirrors
// the accelerators registered in src/main/menu.ts.

import { X } from 'lucide-react'
import { useStore } from '../store'
import { CirthTelchar } from './brand/CirthMark'

const SECTIONS: { title: string; binds: [string, string][] }[] = [
  {
    title: 'Sessions & panes',
    binds: [
      ['⌘T', 'New terminal (active project, active pane)'],
      ['⌘\\ / ⌃⌘→', 'Split pane right — same project + cwd'],
      ['⌘⌥\\ / ⌃⌘↓', 'Split pane down'],
      ['⌘W', 'Close tab'],
      ['⌘1 … ⌘9', 'Focus pane 1–9 in the active layout'],
      ['⌘⇧] / ⌘⇧[', 'Next / previous tab in the focused pane'],
      ['⌘⇧Enter', 'Maximize / restore focused pane'],
      ['double-click tab', 'Rename tab (pins over claude titles)']
    ]
  },
  {
    title: 'Find & triage',
    binds: [
      ['⌘O', 'Session overview — every session, every layout'],
      ['⌘⇧A', 'Jump to oldest needs-input session (cross-layout)'],
      ['⌘P', 'Quick open — jump to session or file'],
      ['⌘⇧P', 'Command palette — every action'],
      ['⌘/', 'This shortcut reference']
    ]
  },
  {
    title: 'Layouts & chrome',
    binds: [
      ['⌘⇧N', 'New layout'],
      ['⌘⌥← / ⌘⌥→', 'Previous / next layout'],
      ['drag tab → layout name', 'Move tab to another layout'],
      ['⌘B', 'Toggle sidebar'],
      ['double-click layout', 'Rename layout']
    ]
  }
]

export function KeybindsHelp() {
  const open = useStore((s) => s.keybindsOpen)
  const setKeybinds = useStore((s) => s.setKeybinds)
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
      onClick={() => setKeybinds(false)}
      onKeyDown={(e) => e.key === 'Escape' && setKeybinds(false)}
    >
      <div
        className="max-h-[80vh] w-[520px] max-w-[90vw] overflow-y-auto rounded-xl border border-border bg-bgalt p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center">
          <span className="flex-1 text-[13px] font-semibold">Keyboard shortcuts</span>
          <button
            onClick={() => setKeybinds(false)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-dim hover:bg-panel hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
        {SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-dim uppercase">
              {section.title}
            </div>
            <div className="flex flex-col gap-1.5">
              {section.binds.map(([key, desc]) => (
                <div key={key + desc} className="flex items-center gap-3">
                  <kbd className="min-w-[110px] rounded border border-border bg-panel px-1.5 py-0.5 text-center font-mono text-[11px] text-fg">
                    {key}
                  </kbd>
                  <span className="text-[12px] text-dim">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-1 flex justify-center text-ember/40" title="Telchar, in Daeron's runes">
          <CirthTelchar className="h-3 w-auto" />
        </div>
      </div>
    </div>
  )
}
