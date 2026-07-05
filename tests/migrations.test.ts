import { describe, expect, it } from 'vitest'
import { runMigrations, readVersion } from '../src/main/migrations'
import { SCHEMA_VERSION, defaultState } from '../src/shared/types'

const v1State = {
  version: 1,
  projects: [
    { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#60a5fa', collapsed: false }
  ],
  layout: {
    tabs: [
      { id: 't1', kind: 'terminal', projectId: 'p1', title: 'proj', cwd: '/tmp/proj' },
      { id: 't2', kind: 'plan', projectId: 'p1', title: 'a plan', path: '/tmp/plan.md' }
    ],
    activeTabId: 't1'
  }
}

const v2State = {
  version: 2,
  projects: [
    { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#60a5fa', collapsed: false },
    { id: 'p2', name: 'other', path: '/tmp/other', color: '#f472b6', collapsed: false }
  ],
  tabs: {
    t1: { id: 't1', kind: 'terminal', projectId: 'p1', title: 'proj', cwd: '/tmp/proj' }
  },
  layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: 't1' }],
  activeLayoutId: 'default',
  sidebar: { view: 'sessions', width: 224, collapsed: false, scope: 'all' }
}

const v3State = {
  version: 3,
  projects: [
    { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#60a5fa', collapsed: false }
  ],
  tabs: {
    t1: { id: 't1', kind: 'terminal', projectId: 'p1', title: 'proj', cwd: '/tmp/proj' }
  },
  layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: 't1' }],
  activeLayoutId: 'default',
  sidebar: { view: 'sessions', width: 224, collapsed: false, selectedProjectId: 'p1' }
}

const v4State = {
  version: 4,
  projects: [
    { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#60a5fa', collapsed: false }
  ],
  tabs: {
    t1: { id: 't1', kind: 'terminal', projectId: 'p1', title: 'proj', cwd: '/tmp/proj', titlePinned: true }
  },
  layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: 't1' }],
  activeLayoutId: 'default',
  sidebar: { view: 'sessions', width: 224, collapsed: false, selectedProjectId: 'p1' },
  theme: 'dark'
}

const v5State = {
  version: 5,
  projects: [
    { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#60a5fa', collapsed: false }
  ],
  tabs: {
    t1: { id: 't1', kind: 'terminal', projectId: 'p1', title: 'proj', cwd: '/tmp/proj', color: '#f472b6' }
  },
  layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: 't1', icon: '🚀' }],
  activeLayoutId: 'default',
  sidebar: { view: 'sessions', width: 224, collapsed: false, selectedProjectId: 'p1' },
  theme: 'light'
}

describe('runMigrations', () => {
  it('migrates v1 all the way to current: tabs map + default layout + selected project', () => {
    const out = runMigrations(v1State) as ReturnType<typeof defaultState>
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(Object.keys(out.tabs)).toEqual(['t1', 't2'])
    expect(out.tabs['t1']).toMatchObject({ kind: 'terminal', cwd: '/tmp/proj' })
    expect(out.layouts).toHaveLength(1)
    expect(out.layouts[0]).toMatchObject({ id: 'default', dock: null, activeTabId: 't1' })
    expect(out.activeLayoutId).toBe('default')
    expect(out.sidebar).toMatchObject({ view: 'sessions', collapsed: false, selectedProjectId: 'p1' })
    expect(out.sidebar).not.toHaveProperty('scope')
    expect(out.projects).toHaveLength(1)
    expect(out.theme).toBe('system')
  })

  it("v2→v3 maps scope 'all' to the first project id and drops scope", () => {
    const out = runMigrations(v2State) as ReturnType<typeof defaultState>
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(out.sidebar.selectedProjectId).toBe('p1')
    expect(out.sidebar).not.toHaveProperty('scope')
  })

  it("v3→v4 adds theme 'system' and preserves everything else", () => {
    const out = runMigrations(v3State) as ReturnType<typeof defaultState>
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(out.theme).toBe('system')
    expect(out.tabs).toEqual(v3State.tabs)
    expect(out.layouts).toEqual(v3State.layouts)
    expect(out.sidebar).toEqual(v3State.sidebar)
    expect(out.projects).toEqual(v3State.projects)
  })

  it('throws when v3 payload is malformed (caller backs up + resets)', () => {
    expect(() => runMigrations({ version: 3, projects: 'nope' })).toThrow()
  })

  it('v4→v5 stamps the version and preserves everything else', () => {
    const out = runMigrations(v4State) as ReturnType<typeof defaultState>
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(out.tabs).toEqual(v4State.tabs)
    expect(out.layouts).toEqual(v4State.layouts)
    expect(out.sidebar).toEqual(v4State.sidebar)
    expect(out.projects).toEqual(v4State.projects)
    expect(out.theme).toBe('dark')
  })

  it('throws when v4 payload is malformed (caller backs up + resets)', () => {
    expect(() => runMigrations({ version: 4, projects: 'nope' })).toThrow()
  })

  it("v5→v6 adds planPreview 'split' and preserves everything else", () => {
    const out = runMigrations(v5State) as ReturnType<typeof defaultState>
    expect(out.version).toBe(SCHEMA_VERSION)
    expect(out.planPreview).toBe('split')
    expect(out.tabs).toEqual(v5State.tabs)
    expect(out.layouts).toEqual(v5State.layouts)
    expect(out.sidebar).toEqual(v5State.sidebar)
    expect(out.projects).toEqual(v5State.projects)
    expect(out.theme).toBe('light')
  })

  it('throws when v5 payload is malformed (caller backs up + resets)', () => {
    expect(() => runMigrations({ version: 5, projects: 'nope' })).toThrow()
  })

  it('v2→v3 keeps a scope that points at a real project', () => {
    const out = runMigrations({
      ...v2State,
      sidebar: { ...v2State.sidebar, scope: 'p2' }
    }) as ReturnType<typeof defaultState>
    expect(out.sidebar.selectedProjectId).toBe('p2')
  })

  it('v2→v3 replaces a stale scope with the first project id', () => {
    const out = runMigrations({
      ...v2State,
      sidebar: { ...v2State.sidebar, scope: 'gone' }
    }) as ReturnType<typeof defaultState>
    expect(out.sidebar.selectedProjectId).toBe('p1')
  })

  it('v2→v3 omits selectedProjectId when there are no projects', () => {
    const out = runMigrations({
      ...v2State,
      projects: [],
      tabs: {},
      layouts: [{ id: 'default', name: 'Workspace', dock: null, activeTabId: null }]
    }) as ReturnType<typeof defaultState>
    expect(out.sidebar).not.toHaveProperty('selectedProjectId')
    expect(out.sidebar).not.toHaveProperty('scope')
  })

  it('throws when v2 payload is malformed (caller backs up + resets)', () => {
    expect(() => runMigrations({ version: 2, projects: 'nope' })).toThrow()
  })

  it('passes current-version state through untouched', () => {
    const current = defaultState()
    expect(runMigrations(current)).toBe(current)
  })

  it('drops the never-written v1 scrollback field', () => {
    const out = runMigrations({ ...v1State, scrollback: { t1: 'x' } }) as Record<string, unknown>
    expect(out).not.toHaveProperty('scrollback')
  })

  it('throws on unknown versions', () => {
    expect(() => runMigrations({ version: 0 })).toThrow()
    expect(() => runMigrations({ version: SCHEMA_VERSION + 1 })).toThrow()
    expect(() => runMigrations(null)).toThrow()
    expect(() => runMigrations('junk')).toThrow()
  })

  it('throws when v1 payload is malformed (caller backs up + resets)', () => {
    expect(() => runMigrations({ version: 1, projects: 'nope' })).toThrow()
  })
})

describe('readVersion', () => {
  it('reads numeric versions and rejects junk', () => {
    expect(readVersion({ version: 2 })).toBe(2)
    expect(Number.isNaN(readVersion(null))).toBe(true)
    expect(Number.isNaN(readVersion({}))).toBe(true)
  })
})
