import { describe, expect, it, vi } from 'vitest'
import type { DockviewApi } from 'dockview-react'
import { fromEnvelope, referencedTabIds, DOCK_LIB, DOCK_LIB_VERSION } from '../src/renderer/components/dock/adapter'

describe('referencedTabIds', () => {
  const env = (grid: unknown) => ({ lib: DOCK_LIB, libVersion: DOCK_LIB_VERSION, grid })

  it('reads panel ids out of a serialized dockview grid', () => {
    expect(
      referencedTabIds(env({ grid: {}, panels: { a: { id: 'a' }, b: { id: 'b' } } }))
    ).toEqual(['a', 'b'])
  })

  it('tolerates junk grids', () => {
    expect(referencedTabIds(env(null))).toEqual([])
    expect(referencedTabIds(env('nonsense'))).toEqual([])
    expect(referencedTabIds(env({ panels: null }))).toEqual([])
    expect(referencedTabIds(null)).toEqual([])
  })

  it('rejects foreign libs', () => {
    expect(
      referencedTabIds({ lib: 'other', libVersion: '1.0.0', grid: { panels: { a: {} } } })
    ).toEqual([])
  })
})

// The fallback contract: fromEnvelope returns false on anything incompatible
// or throwing, so DockHost rebuilds a default grid — geometry lost, tabs never.
describe('fromEnvelope', () => {
  const fakeApi = (opts?: { throwOnFromJSON?: boolean; panelIds?: string[] }) => {
    const removed: string[] = []
    const api = {
      fromJSON: opts?.throwOnFromJSON
        ? vi.fn(() => {
            throw new Error('corrupt grid')
          })
        : vi.fn(),
      clear: vi.fn(),
      removePanel: vi.fn((p: { id: string }) => removed.push(p.id)),
      get panels() {
        return (opts?.panelIds ?? []).filter((id) => !removed.includes(id)).map((id) => ({ id }))
      }
    }
    return { api: api as unknown as DockviewApi, removed, raw: api }
  }

  const env = (over?: Partial<{ lib: string; libVersion: string }>) => ({
    lib: DOCK_LIB,
    libVersion: DOCK_LIB_VERSION,
    grid: {},
    ...over
  })

  it('restores a compatible envelope and strips unknown tabs', () => {
    const { api, removed } = fakeApi({ panelIds: ['keep', 'ghost'] })
    expect(fromEnvelope(api, env(), new Set(['keep']))).toBe(true)
    expect(removed).toEqual(['ghost'])
  })

  it('refuses a foreign lib or major-version drift without touching the api', () => {
    const foreign = fakeApi()
    expect(fromEnvelope(foreign.api, env({ lib: 'other' }), new Set())).toBe(false)
    expect(foreign.raw.fromJSON).not.toHaveBeenCalled()

    const drifted = fakeApi()
    expect(fromEnvelope(drifted.api, env({ libVersion: '8.0.0' }), new Set())).toBe(false)
    expect(drifted.raw.fromJSON).not.toHaveBeenCalled()
  })

  it('catches a throwing fromJSON, clears, and reports failure', () => {
    const { api, raw } = fakeApi({ throwOnFromJSON: true })
    expect(fromEnvelope(api, env(), new Set())).toBe(false)
    expect(raw.clear).toHaveBeenCalled()
  })
})
