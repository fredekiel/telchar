// Resolver over Claude Code transcripts: planFilePath extraction, token
// parsing, containment, and the newest-top-level-transcript fallback.

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const HOME = vi.hoisted(() => ({ dir: '' }))

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>()
  return { ...os, homedir: () => HOME.dir }
})

import { getClaudeSessionInfo } from '../src/main/claudeSession'

const PROJECT = '/tmp/proj'
const SLUG = PROJECT.replace(/[^a-zA-Z0-9]/g, '-')

let plansDir: string
let projDir: string

function assistantLine(input: number, cacheRead: number, cacheCreate: number): string {
  return JSON.stringify({
    type: 'assistant',
    message: {
      usage: {
        input_tokens: input,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreate,
        output_tokens: 42
      }
    }
  })
}

beforeAll(() => {
  HOME.dir = mkdtempSync(join(tmpdir(), 'telchar-claude-'))
  plansDir = join(HOME.dir, '.claude', 'plans')
  projDir = join(HOME.dir, '.claude', 'projects', SLUG)
  mkdirSync(plansDir, { recursive: true })
  mkdirSync(projDir, { recursive: true })
})

afterAll(() => rmSync(HOME.dir, { recursive: true, force: true }))

describe('getClaudeSessionInfo', () => {
  it('extracts the session plan + tokens, ignoring unrelated plan mentions', async () => {
    const plan = join(plansDir, 'my-real-plan.md')
    const transcript = join(projDir, 'session-a.jsonl')
    writeFileSync(
      transcript,
      [
        JSON.stringify({ type: 'user', message: 'looked at plans/other-one.md and plans/noise.md' }),
        assistantLine(2, 100, 10),
        JSON.stringify({ type: 'attachment', attachment: { planFilePath: plan } }),
        JSON.stringify({ type: 'user', message: 'more plans/red-herring.md chatter' }),
        assistantLine(2, 57_701, 5_822)
      ].join('\n')
    )
    const info = await getClaudeSessionInfo({ transcriptPath: transcript })
    expect(info.planPath).toBe(plan)
    expect(info.planTitle).toBe('my real plan')
    expect(info.contextTokens).toBe(2 + 57_701 + 5_822)
  })

  it('rejects a planFilePath outside ~/.claude/plans', async () => {
    const transcript = join(projDir, 'session-b.jsonl')
    writeFileSync(
      transcript,
      JSON.stringify({ attachment: { planFilePath: '/etc/passwd' } }) + '\n' + assistantLine(1, 2, 3)
    )
    const info = await getClaudeSessionInfo({ transcriptPath: transcript })
    expect(info.planPath).toBeUndefined()
    expect(info.contextTokens).toBe(6)
  })

  it('rejects a transcriptPath outside ~/.claude/projects', async () => {
    const outside = join(HOME.dir, 'evil.jsonl')
    writeFileSync(outside, assistantLine(1, 1, 1))
    const info = await getClaudeSessionInfo({ transcriptPath: outside })
    expect(info).toEqual({})
  })

  it('skips junk lines when scanning tokens backwards', async () => {
    const transcript = join(projDir, 'session-c.jsonl')
    writeFileSync(
      transcript,
      [assistantLine(10, 20, 30), '{"type":"assistant","usage" truncated-garbage'].join('\n')
    )
    const info = await getClaudeSessionInfo({ transcriptPath: transcript })
    expect(info.contextTokens).toBe(60)
  })

  it('fallback picks the newest top-level transcript, never subagents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'telchar-claude-fb-'))
    try {
      HOME.dir = dir
      const plans = join(dir, '.claude', 'plans')
      const proj = join(dir, '.claude', 'projects', SLUG)
      const sub = join(proj, 'old-session', 'subagents')
      mkdirSync(plans, { recursive: true })
      mkdirSync(sub, { recursive: true })

      const oldPlan = join(plans, 'old.md')
      const newPlan = join(plans, 'new.md')
      const oldT = join(proj, 'old-session.jsonl')
      const newT = join(proj, 'new-session.jsonl')
      writeFileSync(oldT, JSON.stringify({ attachment: { planFilePath: oldPlan } }))
      writeFileSync(newT, JSON.stringify({ attachment: { planFilePath: newPlan } }))
      // A subagent transcript newer than everything must not win.
      writeFileSync(join(sub, 'agent-x.jsonl'), JSON.stringify({ attachment: { planFilePath: oldPlan } }))
      utimesSync(oldT, new Date(1000), new Date(1000))
      utimesSync(newT, new Date(2000), new Date(2000))

      const info = await getClaudeSessionInfo({ projectPath: PROJECT })
      expect(info.planPath).toBe(newPlan)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      HOME.dir = join(plansDir, '..', '..') // restore original fake home
    }
  })

  it('returns empty for a missing transcript and empty opts', async () => {
    expect(await getClaudeSessionInfo({})).toEqual({})
    expect(await getClaudeSessionInfo({ transcriptPath: join(projDir, 'nope.jsonl') })).toEqual({})
    expect(await getClaudeSessionInfo({ projectPath: '/tmp/never-seen' })).toEqual({})
  })
})
