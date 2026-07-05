// Settings overlay (gear icon in the activity bar). Same shell as
// KeybindsHelp. Currently one setting: appearance (dark / light / system).

import { X } from 'lucide-react'
import type { ThemeMode, PlanPreviewMode } from '@shared/types'
import { useStore } from '../store'
import { Certh8, CirthTelchar } from './brand/CirthMark'

const THEME_OPTIONS: { mode: ThemeMode; label: string; hint: string }[] = [
  { mode: 'system', label: 'System', hint: 'Follow macOS appearance' },
  { mode: 'light', label: 'Light', hint: 'Tokyo Night Day' },
  { mode: 'dark', label: 'Dark', hint: 'Tokyo Night' }
]

const PLAN_PREVIEW_OPTIONS: { mode: PlanPreviewMode; label: string; hint: string }[] = [
  { mode: 'split', label: 'Side split', hint: 'Auto-open preview beside the terminal' },
  { mode: 'tab', label: 'New tab', hint: 'Auto-open preview as a new tab' },
  { mode: 'prompt', label: 'Prompt', hint: "Don't auto-open; highlight the View plan button" },
  { mode: 'off', label: 'Off', hint: 'Manual only — open from the footer or Plans view' }
]

export function Settings() {
  const open = useStore((s) => s.settingsOpen)
  const setSettings = useStore((s) => s.setSettings)
  const theme = useStore((s) => s.state.theme)
  const setTheme = useStore((s) => s.setTheme)
  const planPreview = useStore((s) => s.state.planPreview)
  const setPlanPreview = useStore((s) => s.setPlanPreview)
  if (!open) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
      onClick={() => setSettings(false)}
      onKeyDown={(e) => e.key === 'Escape' && setSettings(false)}
    >
      <div
        className="max-h-[80vh] w-[520px] max-w-[90vw] overflow-y-auto rounded-xl border border-border bg-bgalt p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center">
          <span className="flex-1 text-[13px] font-semibold">Settings</span>
          <button
            onClick={() => setSettings(false)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-dim hover:bg-panel hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-dim uppercase">
          Appearance
        </div>
        <div className="flex gap-1 rounded-lg bg-panel p-1">
          {THEME_OPTIONS.map(({ mode, label, hint }) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              title={hint}
              className={
                'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[12px] ' +
                (theme === mode
                  ? 'bg-panelhi font-semibold text-fg'
                  : 'text-dim hover:bg-panelhi/50 hover:text-fg')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 mb-1.5 text-[10px] font-semibold tracking-widest text-dim uppercase">
          Plan preview
        </div>
        <div className="mb-2 text-[11px] text-dim">
          What happens when Claude writes a plan.
        </div>
        <div className="flex gap-1 rounded-lg bg-panel p-1">
          {PLAN_PREVIEW_OPTIONS.map(({ mode, label, hint }) => (
            <button
              key={mode}
              onClick={() => setPlanPreview(mode)}
              title={hint}
              className={
                'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-[12px] ' +
                (planPreview === mode
                  ? 'bg-panelhi font-semibold text-fg'
                  : 'text-dim hover:bg-panelhi/50 hover:text-fg')
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
          <span className="text-ember">
            <Certh8 className="h-6 w-auto" />
          </span>
          <div className="flex-1">
            <div className="text-[12px] font-semibold text-fg">Telchar</div>
            <div className="text-[11px] text-dim italic">One forge. Many sessions.</div>
          </div>
          <span className="text-ember/40" title="Telchar, in Daeron's runes">
            <CirthTelchar className="h-3.5 w-auto" />
          </span>
        </div>
      </div>
    </div>
  )
}
