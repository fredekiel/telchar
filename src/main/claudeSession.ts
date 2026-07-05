// Per-session info for the terminal footer's Claude segment. Source is the
// Claude Code transcript (~/.claude/projects/<encoded-cwd>/<session>.jsonl),
// located either exactly (transcript_path from a hook event) or heuristically
// (newest top-level transcript in the project's dir — subagent transcripts
// live in <session>/subagents/ subdirs and must not win).
//
// The transcript format is internal to Claude Code, so this file makes only
// two narrow, fail-soft scans and never JSON-parses the whole file:
//   - `"planFilePath":"…"` — the session's own plan (verified unique per
//     session; generic plans/*.md mentions are noisy and unreliable)
//   - the last `"type":"assistant"` line's message.usage — context tokens
// Any parse failure degrades to undefined fields rather than throwing.

import { createReadStream, promises as fs } from 'fs'
import { homedir } from 'os'
import { basename, join, resolve, sep } from 'path'
import type { ClaudeSessionInfo } from '@shared/ipc'

const TOKEN_SCAN_BYTES = 256 * 1024
// planFilePath matches can straddle stream chunks; carry a tail this long.
const CHUNK_OVERLAP = 4096
const PLAN_RE = /"planFilePath":"((?:[^"\\]|\\.)*)"/g

const projectsRoot = () => resolve(homedir(), '.claude', 'projects')
const plansRoot = () => resolve(homedir(), '.claude', 'plans')

function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep)
}

export function titleFromPlanFile(path: string): string {
  return basename(path, '.md').replace(/-/g, ' ')
}

export async function getClaudeSessionInfo(opts: {
  transcriptPath?: string
  projectPath?: string
}): Promise<ClaudeSessionInfo> {
  const transcript = await resolveTranscript(opts)
  if (!transcript) return {}
  const [planPath, contextTokens] = await Promise.all([
    scanPlanFilePath(transcript),
    scanContextTokens(transcript)
  ])
  return {
    planPath,
    planTitle: planPath ? titleFromPlanFile(planPath) : undefined,
    contextTokens
  }
}

// Hook-supplied paths are untrusted: realpath + containment in the transcript
// root, and must be a top-level session file (not a subagent transcript).
async function resolveTranscript(opts: {
  transcriptPath?: string
  projectPath?: string
}): Promise<string | undefined> {
  if (opts.transcriptPath) {
    try {
      // realpath both sides — the containment check must survive symlinked
      // parents (e.g. macOS /var -> /private/var).
      const root = await fs.realpath(projectsRoot())
      const real = await fs.realpath(resolve(opts.transcriptPath))
      if (within(root, real) && real.endsWith('.jsonl')) return real
    } catch {
      /* dangling path from a stale hook event */
    }
    return undefined
  }
  if (opts.projectPath) return newestTranscript(opts.projectPath)
  return undefined
}

async function newestTranscript(projectPath: string): Promise<string | undefined> {
  // Claude Code encodes the session cwd by dashing every non-alphanumeric char.
  const encoded = projectPath.replace(/[^a-zA-Z0-9]/g, '-')
  const dir = join(projectsRoot(), encoded)
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    let best: { path: string; mtimeMs: number } | undefined
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
      const path = join(dir, e.name)
      const stat = await fs.stat(path)
      if (!best || stat.mtimeMs > best.mtimeMs) best = { path, mtimeMs: stat.mtimeMs }
    }
    return best?.path
  } catch {
    return undefined
  }
}

// Streaming scan (transcripts reach tens of MB); the LAST match wins and the
// extracted path must live under ~/.claude/plans.
async function scanPlanFilePath(transcript: string): Promise<string | undefined> {
  return new Promise((resolvePromise) => {
    let tail = ''
    let last: string | undefined
    const stream = createReadStream(transcript, { encoding: 'utf8' })
    stream.on('data', (chunk) => {
      const text = tail + chunk
      for (const m of text.matchAll(PLAN_RE)) last = m[1]
      tail = text.slice(-CHUNK_OVERLAP)
    })
    const finish = () => {
      if (!last) return resolvePromise(undefined)
      try {
        const path = resolve(JSON.parse(`"${last}"`) as string)
        resolvePromise(within(plansRoot(), path) ? path : undefined)
      } catch {
        resolvePromise(undefined)
      }
    }
    stream.on('end', finish)
    stream.on('error', () => resolvePromise(undefined))
  })
}

// Context size ≈ input + cache_read + cache_creation of the LAST assistant
// entry. Only that single line is JSON-parsed.
async function scanContextTokens(transcript: string): Promise<number | undefined> {
  let text: string
  try {
    const fh = await fs.open(transcript, 'r')
    try {
      const size = (await fh.stat()).size
      const start = Math.max(0, size - TOKEN_SCAN_BYTES)
      const buf = Buffer.alloc(size - start)
      await fh.read(buf, 0, buf.length, start)
      text = buf.toString('utf8')
    } finally {
      await fh.close()
    }
  } catch {
    return undefined
  }
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue
    try {
      const entry = JSON.parse(line) as {
        type?: string
        message?: {
          usage?: {
            input_tokens?: number
            cache_read_input_tokens?: number
            cache_creation_input_tokens?: number
          }
        }
      }
      if (entry.type !== 'assistant') continue
      const u = entry.message?.usage
      if (!u) continue
      return (
        (u.input_tokens ?? 0) +
        (u.cache_read_input_tokens ?? 0) +
        (u.cache_creation_input_tokens ?? 0)
      )
    } catch {
      /* truncated first line of the tail window — keep walking back */
    }
  }
  return undefined
}
