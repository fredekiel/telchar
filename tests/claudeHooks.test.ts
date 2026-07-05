// Installer idempotency: fresh install writes all events; an existing older
// install (Notification/Stop only) gains SessionStart without duplicates.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const HOME = vi.hoisted(() => ({ dir: '' }))

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  return { ...os, homedir: () => HOME.dir }
})

import { installClaudeHooks } from '../src/main/claudeHooks'

interface HooksFile {
  hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
}

function readSettings(): HooksFile {
  return JSON.parse(readFileSync(join(HOME.dir, '.claude', 'settings.json'), 'utf8')) as HooksFile
}

beforeEach(() => {
  HOME.dir = mkdtempSync(join(tmpdir(), 'telchar-hooks-'))
})

describe('installClaudeHooks', () => {
  it('fresh install registers Notification, Stop and SessionStart', async () => {
    const res = await installClaudeHooks()
    expect(res.ok).toBe(true)
    const s = readSettings()
    for (const event of ['Notification', 'Stop', 'SessionStart']) {
      expect(s.hooks[event]).toHaveLength(1)
      expect(s.hooks[event][0].hooks[0].command).toContain('telchar-attention-hook')
      expect(s.hooks[event][0].hooks[0].command).toContain(`event=${event}`)
    }
  })

  it('upgrades an old install (Notification/Stop) with SessionStart only, keeping others', async () => {
    mkdirSync(join(HOME.dir, '.claude'), { recursive: true })
    await installClaudeHooks()
    const before = readSettings()
    delete before.hooks.SessionStart // simulate pre-SessionStart install
    writeFileSync(join(HOME.dir, '.claude', 'settings.json'), JSON.stringify(before))

    const res = await installClaudeHooks()
    expect(res.ok).toBe(true)
    const after = readSettings()
    expect(after.hooks.SessionStart).toHaveLength(1)
    expect(after.hooks.Notification).toHaveLength(1)
    expect(after.hooks.Stop).toHaveLength(1)
    // Backup written before modifying an existing file.
    expect(existsSync(join(HOME.dir, '.claude', 'settings.json.bak-telchar'))).toBe(true)
  })

  it('is a no-op when everything is already installed', async () => {
    await installClaudeHooks()
    const res = await installClaudeHooks()
    expect(res.detail).toBe('already installed')
    const s = readSettings()
    expect(s.hooks.Stop).toHaveLength(1)
  })
})
