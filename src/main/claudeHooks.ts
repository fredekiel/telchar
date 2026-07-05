// Opt-in installer for Claude Code attention hooks (~/.claude/settings.json).
// Idempotent (marker-matched), backs the file up first, and the hook command
// is inert outside Telchar terminals (guards on $TELCHAR_HOOK_PORT).

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const MARKER = 'telchar-attention-hook'

// $-vars expand in the hook's shell from the PTY env Telchar injected.
const HOOK_COMMAND = `[ -n "$TELCHAR_HOOK_PORT" ] && curl -s -m 2 -X POST "http://127.0.0.1:$TELCHAR_HOOK_PORT/hook?tab=$TELCHAR_TAB_ID&event=__EVENT__&token=$TELCHAR_HOOK_TOKEN" --data-binary @- -H "Content-Type: application/json" >/dev/null 2>&1 || true # ${MARKER}`

interface HookDef {
  type: 'command'
  command: string
}
interface HookMatcher {
  matcher?: string
  hooks: HookDef[]
}

export async function installClaudeHooks(): Promise<{ ok: boolean; detail: string }> {
  const file = join(homedir(), '.claude', 'settings.json')
  let settings: Record<string, unknown> = {}
  let existed = false
  try {
    settings = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>
    existed = true
  } catch {
    /* fresh settings file */
  }

  const hooks = (settings.hooks ?? {}) as Record<string, HookMatcher[]>
  let changed = false
  for (const event of ['Notification', 'Stop', 'SessionStart']) {
    const list: HookMatcher[] = Array.isArray(hooks[event]) ? hooks[event] : []
    const already = list.some((m) => m.hooks?.some((h) => h.command?.includes(MARKER)))
    if (!already) {
      list.push({ hooks: [{ type: 'command', command: HOOK_COMMAND.replace('__EVENT__', event) }] })
      hooks[event] = list
      changed = true
    }
  }
  if (!changed) return { ok: true, detail: 'already installed' }

  settings.hooks = hooks
  if (existed) await fs.copyFile(file, `${file}.bak-telchar`).catch(() => {})
  await fs.mkdir(join(homedir(), '.claude'), { recursive: true })
  await fs.writeFile(file, JSON.stringify(settings, null, 2), 'utf8')
  return { ok: true, detail: existed ? 'hooks added (backup written)' : 'settings.json created with hooks' }
}
