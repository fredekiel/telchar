// Global session overview (⌘O): cards for every terminal session in every
// layout, output tail from main's ring buffer, needs-input first. Enter/click
// jumps (switching layout if needed). Zero xterm instances, zero GL pressure.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { TerminalTab } from '@shared/types'
import { useStore } from '../store'
import { useRuntime, needsInputQueue, type TabRuntime } from '../state/runtime'
import { AttentionDot } from './AttentionDot'
import { DecorIcon } from './DecorIcon'

const TAIL_LINES = 6
const REFRESH_MS = 250

// Strip ANSI escapes + control chars for readable card tails.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g

function tailOf(snapshot: string): string {
  const clean = snapshot.replace(ANSI_RE, '').replace(/\r/g, '')
  const lines = clean.split('\n').filter((l) => l.trim().length > 0)
  return lines.slice(-TAIL_LINES).join('\n')
}

const ATTENTION_RANK: Record<TabRuntime['attention'], number> = {
  'needs-input': 0,
  busy: 1,
  idle: 2,
  exited: 3
}

export function Overview() {
  const open = useStore((s) => s.overviewOpen)
  const setOverview = useStore((s) => s.setOverview)
  const jumpToTab = useStore((s) => s.jumpToTab)
  const tabs = useStore((s) => s.state.tabs)
  const projects = useStore((s) => s.state.projects)
  const layouts = useStore((s) => s.state.layouts)
  const byTab = useRuntime((s) => s.byTab)
  const tabLayout = useRuntime((s) => s.tabLayout)

  const [filter, setFilter] = useState('')
  const [cursor, setCursor] = useState(0)
  const [tails, setTails] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const sessions = useMemo(() => {
    const terms = Object.values(tabs).filter((t): t is TerminalTab => t.kind === 'terminal')
    const f = filter.trim().toLowerCase()
    const filtered = f
      ? terms.filter((t) => {
          const project = projects.find((p) => p.id === t.projectId)
          const hay = `${t.title} ${byTab[t.id]?.oscTitle ?? ''} ${project?.name ?? ''} ${t.cwd}`.toLowerCase()
          return f.split(/\s+/).every((part) => hay.includes(part))
        })
      : terms
    return filtered.sort((a, b) => {
      const ra = ATTENTION_RANK[byTab[a.id]?.attention ?? 'idle']
      const rb = ATTENTION_RANK[byTab[b.id]?.attention ?? 'idle']
      if (ra !== rb) return ra - rb
      const pa = projects.findIndex((p) => p.id === a.projectId)
      const pb = projects.findIndex((p) => p.id === b.projectId)
      return pa - pb
    })
  }, [tabs, projects, filter, byTab])

  // Poll output tails from main's ring buffer while open.
  useEffect(() => {
    if (!open) return
    let alive = true
    const refresh = async () => {
      const entries = await Promise.all(
        sessions.map(async (t) => [t.id, tailOf(await window.telchar.pty.snapshot(t.id))] as const)
      )
      if (alive) setTails(Object.fromEntries(entries))
    }
    void refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [open, sessions])

  useEffect(() => {
    if (open) {
      setFilter('')
      setCursor(0)
      // Focus after paint.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const jump = (tabId: string) => {
    setOverview(false)
    jumpToTab(tabId)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOverview(false)
    else if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, sessions.length - 1))
    else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
    else if (e.key === 'Enter' && sessions[cursor]) jump(sessions[cursor].id)
  }

  const needsInput = needsInputQueue(byTab).length

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-bg/95 backdrop-blur-sm" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <input
          ref={inputRef}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value)
            setCursor(0)
          }}
          placeholder="Filter sessions… (Enter jumps · Esc closes)"
          className="w-80 rounded-md border border-border bg-panel px-3 py-1.5 text-fg outline-none placeholder:text-dim focus:border-accent"
        />
        <span className="text-dim">
          {sessions.length} session{sessions.length === 1 ? '' : 's'}
          {needsInput > 0 && <span className="ml-2 font-semibold text-amber-400">{needsInput} need input</span>}
        </span>
      </div>
      <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 overflow-y-auto p-4">
        {sessions.map((tab, i) => {
          const project = projects.find((p) => p.id === tab.projectId)
          const layout = layouts.find((l) => l.id === tabLayout[tab.id])
          const runtime = byTab[tab.id]
          return (
            <div
              key={tab.id}
              onClick={() => jump(tab.id)}
              style={{ '--tab-color': tab.color } as React.CSSProperties}
              className={
                'cursor-pointer rounded-lg border p-4 hover:border-accent ' +
                (tab.color
                  ? 'bg-[color-mix(in_srgb,var(--tab-color)_12%,var(--color-bgalt))] shadow-[inset_0_2px_0_0_var(--tab-color)] '
                  : 'bg-bgalt ') +
                (i === cursor ? 'border-accent' : 'border-border')
              }
            >
              <div className="mb-2 flex items-center gap-2">
                {tab.icon ? (
                  <DecorIcon icon={tab.icon} color={tab.color} size={13} />
                ) : (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project?.color ?? 'var(--color-dim)' }} />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {runtime?.oscTitle || tab.title}
                </span>
                {layout && <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-dim">{layout.name}</span>}
                <AttentionDot tabId={tab.id} kind="terminal" />
              </div>
              <pre className="max-h-28 overflow-hidden font-mono text-[11px] leading-4 whitespace-pre-wrap text-dim">
                {tails[tab.id] || '—'}
              </pre>
            </div>
          )
        })}
        {sessions.length === 0 && (
          <div className="col-span-full py-10 text-center text-dim">No terminal sessions.</div>
        )}
      </div>
    </div>
  )
}
