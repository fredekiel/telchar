// Localhost listener for Claude Code lifecycle hooks. Each PTY gets
// TELCHAR_HOOK_PORT/TELCHAR_TAB_ID/TELCHAR_HOOK_TOKEN in its env; installed
// hooks curl their stdin JSON here. Loopback-only + shared-secret token so
// other local processes can't spoof attention events.

import { createServer, type Server } from 'http'
import { randomBytes } from 'crypto'

export interface HookEvent {
  tabId: string
  event: string // Notification | Stop | ...
  payload: unknown // hook's stdin JSON (session_id, cwd, message, …)
}

type HookSink = (e: HookEvent) => void

const MAX_BODY = 64 * 1024

class HookServer {
  private server: Server | null = null
  private _port = 0
  private _token = randomBytes(16).toString('hex')
  private sink: HookSink = () => {}

  get port(): number {
    return this._port
  }

  get token(): string {
    return this._token
  }

  setSink(sink: HookSink): void {
    this.sink = sink
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const tabId = url.searchParams.get('tab') ?? ''
      const event = url.searchParams.get('event') ?? ''
      const token = url.searchParams.get('token') ?? ''
      if (req.method !== 'POST' || url.pathname !== '/hook' || token !== this._token || !tabId || !event) {
        res.statusCode = 403
        return res.end()
      }
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY) req.destroy()
        else chunks.push(c)
      })
      req.on('end', () => {
        let payload: unknown = null
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          /* hooks may send nothing */
        }
        this.sink({ tabId, event, payload })
        res.statusCode = 200
        res.end('ok')
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address()
        if (addr && typeof addr === 'object') this._port = addr.port
        resolve()
      })
    })
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }
}

export const hookServer = new HookServer()
