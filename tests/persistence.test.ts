// The recovery wrapper itself: loadState must turn every failure mode into a
// usable default (backing up the evidence, never silently), and saveState must
// never persist garbage. Migrations throwing is covered in migrations.test.ts;
// this file covers what persistence does with those throws.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const USERDATA = vi.hoisted(() => ({ dir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => USERDATA.dir }
}))

import { loadState, saveState, saveStateSync, flushStateSync } from '../src/main/persistence'
import { SCHEMA_VERSION, defaultState } from '../src/shared/types'

const FILE = () => join(USERDATA.dir, 'workspace.json')
const backups = () => readdirSync(USERDATA.dir).filter((f) => f.startsWith('workspace.json.bak-'))

beforeEach(() => {
  USERDATA.dir = mkdtempSync(join(tmpdir(), 'telchar-persist-'))
})

describe('loadState', () => {
  it('missing file: fresh default, no notice, no backup', async () => {
    const res = await loadState()
    expect(res.state).toEqual(defaultState())
    expect(res.notice).toBeUndefined()
    expect(backups()).toHaveLength(0)
  })

  it('round-trips a saved state', async () => {
    const state = defaultState()
    state.theme = 'light'
    await saveState(state)
    const res = await loadState()
    expect(res.state.theme).toBe('light')
    expect(res.notice).toBeUndefined()
  })

  it('truncated JSON (power loss): backs up and resets with corrupt-reset notice', async () => {
    writeFileSync(FILE(), '{"version": 5, "projects": [')
    const res = await loadState()
    expect(res.state).toEqual(defaultState())
    expect(res.notice?.kind).toBe('corrupt-reset')
    expect(res.notice?.backupPath).toBeDefined()
    expect(backups()).toHaveLength(1)
    // The evidence survives byte-for-byte.
    expect(readFileSync(res.notice!.backupPath!, 'utf8')).toBe('{"version": 5, "projects": [')
    expect(existsSync(FILE())).toBe(false)
  })

  it('parseable but invalid content: backs up and resets', async () => {
    writeFileSync(FILE(), JSON.stringify({ version: SCHEMA_VERSION, junk: true }))
    const res = await loadState()
    expect(res.state).toEqual(defaultState())
    expect(res.notice?.kind).toBe('corrupt-reset')
    expect(backups()).toHaveLength(1)
  })

  it('newer schema version (downgrade): distinct notice, backup kept', async () => {
    writeFileSync(FILE(), JSON.stringify({ ...defaultState(), version: SCHEMA_VERSION + 1 }))
    const res = await loadState()
    expect(res.state).toEqual(defaultState())
    expect(res.notice?.kind).toBe('newer-version-reset')
    expect(backups()).toHaveLength(1)
  })

  it('prunes backups beyond the newest 5', async () => {
    for (let i = 0; i < 7; i++) {
      writeFileSync(join(USERDATA.dir, `workspace.json.bak-${1700000000000 + i}`), 'old')
    }
    writeFileSync(FILE(), 'not json')
    await loadState()
    const left = backups()
    expect(left).toHaveLength(5)
    // Oldest three fell off; the fresh backup (largest timestamp) survives.
    expect(left.sort()[0]).toBe('workspace.json.bak-1700000000003')
  })
})

describe('saveState / saveStateSync', () => {
  it('never persists garbage', async () => {
    await saveState(defaultState())
    const before = readFileSync(FILE(), 'utf8')
    await saveState({ nonsense: true } as never)
    saveStateSync({ also: 'nonsense' })
    expect(readFileSync(FILE(), 'utf8')).toBe(before)
  })

  it('saveStateSync round-trips', async () => {
    const state = defaultState()
    state.theme = 'light'
    saveStateSync(state)
    expect((await loadState()).state.theme).toBe('light')
  })

  it('flushStateSync rewrites the last validated state', async () => {
    const state = defaultState()
    state.theme = 'light'
    await saveState(state)
    unlinkSync(FILE()) // simulate the file going missing before quit
    flushStateSync()
    expect((await loadState()).state.theme).toBe('light')
  })

  it('flushStateSync is a no-op failure-swallower without a prior save', () => {
    // lastGoodState may exist from earlier tests in this module; the contract
    // here is only that it never throws.
    expect(() => flushStateSync()).not.toThrow()
  })
})
