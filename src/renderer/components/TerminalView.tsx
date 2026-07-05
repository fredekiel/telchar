import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import type { TerminalTab } from '@shared/types'
import { useRuntime } from '../state/runtime'
import { XTERM_THEMES } from '../theme'

// One hardcoded, reviewed resume command. Never persisted, never executed in
// main — workspace.json tampering can only toggle the boolean that gates it.
const CLAUDE_RESUME_COMMAND = 'claude --continue\n'
const RESUME_PROMPT_WAIT_MS = 300
const RESIZE_DEBOUNCE_MS = 60
// Output within this window keeps a terminal in the 'busy' attention state.
const BUSY_QUIET_MS = 2000
// A BEL arriving this soon after a keystroke is the shell echoing the user's
// own input (e.g. backspace on an empty line) — not a needs-input signal.
const BELL_ECHO_MS = 250

// The renderer terminal is a disposable projection of main-owned session state.
// WebGL only when visible; rehydrate scrollback from main on (re)mount.
export function TerminalView({ tab, visible }: { tab: TerminalTab; visible: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const webglRef = useRef<WebglAddon | null>(null)
  // Opening xterm inside a hidden (display:none, 0-size) panel breaks its
  // renderer ('dimensions' of undefined) — defer open() to first visibility.
  const openedRef = useRef(false)

  // Create xterm + wire pty (once per tab id). Writes before open() queue.
  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Menlo, "SF Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: XTERM_THEMES[useRuntime.getState().effectiveTheme],
      scrollback: 10000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    termRef.current = term
    fitRef.current = fit
    openedRef.current = false

    const runtime = useRuntime.getState()
    let busyTimer: ReturnType<typeof setTimeout> | null = null

    const offData = window.telchar.pty.onData((msg) => {
      if (msg.tabId !== tab.id) return
      term.write(base64ToBytes(msg.data))
      // Activity heuristic: output => busy; quiet 2s => idle (unless a bell
      // or hook escalated to needs-input, which outranks busy).
      runtime.markBusy(tab.id)
      if (busyTimer) clearTimeout(busyTimer)
      busyTimer = setTimeout(() => {
        const cur = useRuntime.getState().byTab[tab.id]
        if (cur?.attention === 'busy') useRuntime.getState().clearAttention(tab.id)
      }, BUSY_QUIET_MS)
    })

    let lastUserInputAt = 0
    term.onData((data) => {
      lastUserInputAt = Date.now()
      window.telchar.pty.input(tab.id, data)
      useRuntime.getState().clearAttention(tab.id)
    })
    const bellDisposable = term.onBell(() => {
      if (Date.now() - lastUserInputAt > BELL_ECHO_MS) useRuntime.getState().bell(tab.id)
    })
    const titleDisposable = term.onTitleChange((t) => useRuntime.getState().setOscTitle(tab.id, t))

    // Rehydrate prior scrollback (dispose-offscreen / reload), then ensure pty.
    let disposed = false
    void (async () => {
      const snapshot = await window.telchar.pty.snapshot(tab.id)
      if (disposed) return
      if (snapshot) term.write(snapshot)
      const { cols, rows } = term
      const { fresh } = await window.telchar.pty.ensure({
        tabId: tab.id,
        cwd: tab.cwd,
        shell: tab.shell,
        cols,
        rows
      })
      // Auto-resume: only on a truly fresh spawn (not reload/HMR reattach) of
      // a terminal that was running claude when the app last saved state.
      if (fresh && tab.wasRunningClaude && !disposed) {
        setTimeout(() => {
          if (!disposed) window.telchar.pty.input(tab.id, CLAUDE_RESUME_COMMAND)
        }, RESUME_PROMPT_WAIT_MS)
      }
    })()

    return () => {
      disposed = true
      offData()
      if (busyTimer) clearTimeout(busyTimer)
      bellDisposable.dispose()
      titleDisposable.dispose()
      const gl = webglRef.current
      webglRef.current = null
      termRef.current = null
      // Defer disposal one macrotask: xterm's viewport keeps a queued rAF that
      // crashes ('dimensions' of undefined) if the renderer dies mid-frame.
      setTimeout(() => {
        gl?.dispose()
        term.dispose()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wasRunningClaude is a spawn-time hint only
  }, [tab.id, tab.cwd, tab.shell])

  // Live retheme: xterm repaints (DOM and WebGL) when options.theme is set.
  const effectiveTheme = useRuntime((s) => s.effectiveTheme)
  useEffect(() => {
    const term = termRef.current
    if (term) term.options.theme = XTERM_THEMES[effectiveTheme]
  }, [effectiveTheme])

  // Open lazily on first REAL visibility (host has pixels — xterm.open() on a
  // 0-size element leaves its render service dimensionless and the viewport
  // rAF loop throws), fit on resize, (de)activate WebGL with visibility.
  useEffect(() => {
    const term = termRef.current
    const fit = fitRef.current
    const host = hostRef.current
    if (!term || !fit || !host) return

    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    let openRaf = 0

    const doFit = () => {
      if (!openedRef.current || !host.offsetWidth || !host.offsetHeight) return
      fit.fit()
      window.telchar.pty.resize(tab.id, term.cols, term.rows)
    }
    // Trailing debounce: divider drags fire ResizeObserver per frame; a
    // SIGWINCH storm confuses TUIs (claude, vim). One resize at rest.
    const debouncedFit = () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(doFit, RESIZE_DEBOUNCE_MS)
    }

    // WebGL only for opened, on-screen terminals (scarce contexts).
    const activate = () => {
      if (!webglRef.current) {
        try {
          const gl = new WebglAddon()
          // Contexts can be dropped by the OS at any time — fall back to the
          // DOM renderer for this terminal and let a later visible-toggle retry.
          gl.onContextLoss(() => {
            webglRef.current?.dispose()
            webglRef.current = null
          })
          term.loadAddon(gl)
          webglRef.current = gl
        } catch {
          /* GL unavailable — DOM renderer fallback */
        }
      }
      doFit()
      term.focus()
    }

    if (visible) {
      if (openedRef.current) {
        activate()
      } else {
        let attempts = 0
        const tryOpen = () => {
          if (openedRef.current || !termRef.current) return
          if (host.offsetWidth > 0 && host.offsetHeight > 0) {
            term.open(host)
            openedRef.current = true
            activate()
          } else if (attempts++ < 120) {
            openRaf = requestAnimationFrame(tryOpen)
          }
        }
        tryOpen()
      }
    } else {
      // Free the scarce WebGL context for offscreen terminals.
      webglRef.current?.dispose()
      webglRef.current = null
    }

    const ro = new ResizeObserver(() => visible && openedRef.current && debouncedFit())
    ro.observe(host)
    return () => {
      if (openRaf) cancelAnimationFrame(openRaf)
      if (resizeTimer) clearTimeout(resizeTimer)
      ro.disconnect()
    }
  }, [visible, tab.id])

  return <div ref={hostRef} className="term-host" />
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
