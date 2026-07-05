// All node-pty access lives behind this module (architecture principle 2).
// IPC handlers call here, never node-pty directly — keeps the future move to a
// UtilityProcess mechanical. Owns runtime state keyed by tabId (principle 1).

import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { EnsureResult, RuntimeStatus, SpawnOptions } from '@shared/types'
import type { PtyStatusMessage } from '@shared/ipc'
import { resolveShellEnv, defaultShell } from './env'
import { hookServer } from './hookServer'

// Coalesce pty output per session and flush once per frame (or on byte cap)
// as one batched binary message — never one IPC message per chunk.
const FLUSH_INTERVAL_MS = 16
const FLUSH_BYTE_CAP = 32 * 1024
// Bounded scrollback ring buffer: rehydration source + drop-oldest under flood.
const RING_CAP_BYTES = 512 * 1024
// Backpressure: pause the pty when the unflushed buffer balloons.
const HIGH_WATER = 4 * 1024 * 1024
// Foreground-process sampling: throttled on data flush + one global sweep
// timer for quiet transitions (claude finishing without output is rare but real).
const PROC_POLL_MIN_MS = 1000
const PROC_SWEEP_MS = 5000

export function isClaudeProcess(name: string): boolean {
  return name === 'claude' || name.startsWith('claude ')
}

interface Session {
  tabId: string
  pty: IPty
  status: RuntimeStatus
  pending: Buffer[]
  pendingBytes: number
  ring: Buffer
  flushTimer: NodeJS.Timeout | null
  paused: boolean
  fgProcess: string
  lastProcPoll: number
}

type DataSink = (tabId: string, base64: string) => void
type StatusSink = (msg: PtyStatusMessage) => void

export class PtyManager {
  private sessions = new Map<string, Session>()
  private onDataSink: DataSink = () => {}
  private onStatusSink: StatusSink = () => {}
  private sweepTimer: NodeJS.Timeout | null = null

  setSinks(data: DataSink, status: StatusSink): void {
    this.onDataSink = data
    this.onStatusSink = status
  }

  // Idempotent: returns the existing live session if present (handles renderer
  // reload/HMR rehydration without orphaning shells). `fresh` gates auto-resume.
  async ensure(opts: SpawnOptions): Promise<EnsureResult> {
    const existing = this.sessions.get(opts.tabId)
    if (existing && existing.status === 'live') {
      // Renderer reattached after a reload — resync size, replay handled via snapshot().
      this.resize(opts.tabId, opts.cols, opts.rows)
      return { status: existing.status, fresh: false }
    }
    if (existing) this.kill(opts.tabId)

    const env = {
      ...(await resolveShellEnv()),
      // Claude Code hooks curl back to us with these (see claudeHooks.ts).
      TELCHAR_HOOK_PORT: String(hookServer.port),
      TELCHAR_HOOK_TOKEN: hookServer.token,
      TELCHAR_TAB_ID: opts.tabId
    }
    const shell = opts.shell || defaultShell()
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cwd: opts.cwd,
      cols: opts.cols,
      rows: opts.rows,
      env: env as { [key: string]: string }
    })

    const session: Session = {
      tabId: opts.tabId,
      pty: proc,
      status: 'live',
      pending: [],
      pendingBytes: 0,
      ring: Buffer.alloc(0),
      flushTimer: null,
      paused: false,
      fgProcess: '',
      lastProcPoll: 0
    }
    this.sessions.set(opts.tabId, session)
    this.ensureSweep()

    proc.onData((chunk) => this.handleData(session, Buffer.from(chunk, 'utf8')))
    proc.onExit(({ exitCode }) => {
      this.flush(session)
      session.status = 'exited'
      this.onStatusSink({ tabId: session.tabId, status: 'exited', exitCode })
    })

    this.onStatusSink({ tabId: opts.tabId, status: 'live' })
    return { status: 'live', fresh: true }
  }

  input(tabId: string, data: string): void {
    const s = this.sessions.get(tabId)
    if (s && s.status === 'live') s.pty.write(data)
  }

  resize(tabId: string, cols: number, rows: number): void {
    const s = this.sessions.get(tabId)
    if (s && s.status === 'live' && cols > 0 && rows > 0) {
      try {
        s.pty.resize(cols, rows)
      } catch {
        /* pty may have just exited */
      }
    }
  }

  kill(tabId: string): void {
    const s = this.sessions.get(tabId)
    if (!s) return
    if (s.flushTimer) clearTimeout(s.flushTimer)
    try {
      s.pty.kill()
    } catch {
      /* already dead */
    }
    this.sessions.delete(tabId)
    if (this.sessions.size === 0 && this.sweepTimer) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.kill(id)
  }

  // Scrollback snapshot for renderer rehydration (lazy mount / dispose-offscreen).
  snapshot(tabId: string): string {
    const s = this.sessions.get(tabId)
    return s ? s.ring.toString('utf8') : ''
  }

  // ---- foreground process tracking ----

  private ensureSweep(): void {
    if (this.sweepTimer) return
    this.sweepTimer = setInterval(() => {
      for (const s of this.sessions.values()) {
        if (s.status === 'live') this.pollProcess(s, /*force*/ true)
      }
    }, PROC_SWEEP_MS)
  }

  private pollProcess(s: Session, force = false): void {
    const now = Date.now()
    if (!force && now - s.lastProcPoll < PROC_POLL_MIN_MS) return
    s.lastProcPoll = now
    let name = ''
    try {
      name = s.pty.process // cheap getter (proc-info syscall, no spawn)
    } catch {
      /* exited */
    }
    if (name !== s.fgProcess) {
      s.fgProcess = name
      this.onStatusSink({
        tabId: s.tabId,
        status: s.status,
        fgProcess: name,
        isClaude: isClaudeProcess(name)
      })
    }
  }

  private handleData(session: Session, chunk: Buffer): void {
    session.pending.push(chunk)
    session.pendingBytes += chunk.length

    // Append to bounded ring buffer (drop oldest).
    session.ring = Buffer.concat([session.ring, chunk])
    if (session.ring.length > RING_CAP_BYTES) {
      session.ring = session.ring.subarray(session.ring.length - RING_CAP_BYTES)
    }

    // Backpressure: a runaway process must not balloon memory.
    if (session.pendingBytes > HIGH_WATER && !session.paused) {
      try {
        session.pty.pause()
        session.paused = true
      } catch {
        /* not all backends support pause */
      }
    }

    if (session.pendingBytes >= FLUSH_BYTE_CAP) {
      this.flush(session)
    } else if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => this.flush(session), FLUSH_INTERVAL_MS)
    }
  }

  private flush(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer)
      session.flushTimer = null
    }
    this.pollProcess(session)
    if (session.pending.length === 0) return
    const batch = Buffer.concat(session.pending)
    session.pending = []
    session.pendingBytes = 0
    this.onDataSink(session.tabId, batch.toString('base64'))
    if (session.paused) {
      try {
        session.pty.resume()
      } catch {
        /* ignore */
      }
      session.paused = false
    }
  }
}

export const ptyManager = new PtyManager()
