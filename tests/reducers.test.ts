import { describe, expect, it } from 'vitest'
import * as R from '../src/renderer/state/reducers'
import { defaultState, type PersistedState, type TerminalTab } from '../src/shared/types'

function term(id: string, projectId = 'p1'): TerminalTab {
  return { id, kind: 'terminal', projectId, title: id, cwd: '/tmp' }
}

function seeded(): PersistedState {
  let s = defaultState()
  s = R.addProject(s, { id: 'p1', name: 'proj', path: '/tmp/proj', color: '#fff', collapsed: false })
  s = R.addTab(s, 'default', term('t1'))
  s = R.addTab(s, 'default', term('t2'))
  return s
}

describe('tabs', () => {
  it('addTab records metadata and activates in the target layout', () => {
    const s = seeded()
    expect(Object.keys(s.tabs)).toEqual(['t1', 't2'])
    expect(s.layouts[0].activeTabId).toBe('t2')
  })

  it('closeTab clears layout activeTabId only when it pointed at the tab', () => {
    let s = seeded()
    s = R.closeTab(s, 't1')
    expect(s.layouts[0].activeTabId).toBe('t2')
    s = R.closeTab(s, 't2')
    expect(s.layouts[0].activeTabId).toBeNull()
    expect(Object.keys(s.tabs)).toHaveLength(0)
  })

  it('setTabClaudeFlag only rewrites on real changes', () => {
    const s = seeded()
    const s2 = R.setTabClaudeFlag(s, 't1', false)
    expect(s2).toBe(s) // no-op: already falsy
    const s3 = R.setTabClaudeFlag(s, 't1', true)
    expect((s3.tabs['t1'] as TerminalTab).wasRunningClaude).toBe(true)
  })
})

describe('tab decor', () => {
  it('setTabColor sets and clears the color key', () => {
    let s = R.setTabColor(seeded(), 't1', '#60a5fa')
    expect(s.tabs['t1'].color).toBe('#60a5fa')
    s = R.setTabColor(s, 't1', undefined)
    expect(s.tabs['t1']).not.toHaveProperty('color')
  })

  it('setTabIcon sets and clears the icon key', () => {
    let s = R.setTabIcon(seeded(), 't1', '🔥')
    expect(s.tabs['t1'].icon).toBe('🔥')
    s = R.setTabIcon(s, 't1', undefined)
    expect(s.tabs['t1']).not.toHaveProperty('icon')
  })

  it('no-ops on missing tab or unchanged value', () => {
    const s = seeded()
    expect(R.setTabColor(s, 'nope', '#fff')).toBe(s)
    expect(R.setTabColor(s, 't1', undefined)).toBe(s) // already unset
    expect(R.setTabIcon(s, 'nope', '🔥')).toBe(s)
  })

  it('unpinTabTitle flips titlePinned and keeps the title', () => {
    let s = R.renameTab(seeded(), 't1', 'my name')
    expect((s.tabs['t1'] as TerminalTab).titlePinned).toBe(true)
    s = R.unpinTabTitle(s, 't1')
    expect((s.tabs['t1'] as TerminalTab).titlePinned).toBe(false)
    expect(s.tabs['t1'].title).toBe('my name')
  })

  it('unpinTabTitle no-ops on unpinned, missing or non-terminal tabs', () => {
    const s = seeded()
    expect(R.unpinTabTitle(s, 't1')).toBe(s)
    expect(R.unpinTabTitle(s, 'nope')).toBe(s)
  })
})

describe('layouts', () => {
  it('createLayout activates the new layout', () => {
    const s = R.createLayout(seeded(), 'L2', 'Second')
    expect(s.layouts).toHaveLength(2)
    expect(s.activeLayoutId).toBe('L2')
  })

  it('deleteLayout refuses to delete the last layout', () => {
    const s = seeded()
    expect(R.deleteLayout(s, 'default', [])).toBe(s)
  })

  it('setLayoutColor / setLayoutIcon set and clear, no-op on unknown ids', () => {
    let s = R.setLayoutColor(seeded(), 'default', '#f472b6')
    expect(s.layouts[0].color).toBe('#f472b6')
    s = R.setLayoutIcon(s, 'default', '🚀')
    expect(s.layouts[0].icon).toBe('🚀')
    s = R.setLayoutColor(s, 'default', undefined)
    expect(s.layouts[0]).not.toHaveProperty('color')
    s = R.setLayoutIcon(s, 'default', undefined)
    expect(s.layouts[0]).not.toHaveProperty('icon')
    expect(R.setLayoutColor(s, 'nope', '#fff')).toBe(s)
    expect(R.setLayoutIcon(s, 'nope', '🚀')).toBe(s)
  })

  it('deleteLayout drops owned tabs and re-targets the active layout', () => {
    let s = R.createLayout(seeded(), 'L2', 'Second')
    s = R.addTab(s, 'L2', term('t3'))
    s = R.deleteLayout(s, 'L2', ['t3'])
    expect(s.layouts.map((l) => l.id)).toEqual(['default'])
    expect(s.activeLayoutId).toBe('default')
    expect(s.tabs['t3']).toBeUndefined()
    expect(s.tabs['t1']).toBeDefined()
  })
})

describe('projects', () => {
  const p2 = { id: 'p2', name: 'other', path: '/tmp/other', color: '#000', collapsed: false }

  it('removeProject drops the project, its tabs and fixes active pointers', () => {
    const s = R.removeProject(seeded(), 'p1')
    expect(s.projects).toHaveLength(0)
    expect(Object.keys(s.tabs)).toHaveLength(0)
    expect(s.layouts[0].activeTabId).toBeNull()
  })

  it('addProject dedupes by path', () => {
    const s = seeded()
    const s2 = R.addProject(s, { id: 'px', name: 'dup', path: '/tmp/proj', color: '#000', collapsed: false })
    expect(s2).toBe(s)
  })

  it('addProject auto-selects the first project', () => {
    const s = seeded()
    expect(s.sidebar.selectedProjectId).toBe('p1')
  })

  it('addProject does not steal an existing valid selection', () => {
    const s = R.addProject(seeded(), p2)
    expect(s.sidebar.selectedProjectId).toBe('p1')
  })

  it('selectProject switches selection and rejects unknown ids', () => {
    let s = R.addProject(seeded(), p2)
    s = R.selectProject(s, 'p2')
    expect(s.sidebar.selectedProjectId).toBe('p2')
    expect(R.selectProject(s, 'nope')).toBe(s)
    expect(R.selectProject(s, 'p2')).toBe(s) // already selected: no-op
  })

  it('removeProject reassigns selection to a survivor', () => {
    let s = R.addProject(seeded(), p2)
    s = R.removeProject(s, 'p1')
    expect(s.sidebar.selectedProjectId).toBe('p2')
  })

  it('removeProject clears selection when the last project goes', () => {
    const s = R.removeProject(seeded(), 'p1')
    expect(s.sidebar.selectedProjectId).toBeUndefined()
  })

  it('removeProject keeps selection when a non-selected project goes', () => {
    let s = R.addProject(seeded(), p2)
    s = R.removeProject(s, 'p2')
    expect(s.sidebar.selectedProjectId).toBe('p1')
  })
})

describe('gcOrphanTabs', () => {
  it('drops tabs not referenced by any layout', () => {
    const s = R.gcOrphanTabs(seeded(), new Set(['t1']))
    expect(Object.keys(s.tabs)).toEqual(['t1'])
  })

  it('no-ops when everything is referenced', () => {
    const s = seeded()
    expect(R.gcOrphanTabs(s, new Set(['t1', 't2']))).toBe(s)
  })
})

describe('theme', () => {
  it('setTheme updates the persisted preference', () => {
    const s = R.setTheme(defaultState(), 'light')
    expect(s.theme).toBe('light')
  })

  it('setTheme no-ops when unchanged', () => {
    const s = defaultState()
    expect(R.setTheme(s, s.theme)).toBe(s)
  })
})

describe('planPreview', () => {
  it('setPlanPreview updates the persisted preference', () => {
    const s = R.setPlanPreview(defaultState(), 'tab')
    expect(s.planPreview).toBe('tab')
  })

  it('setPlanPreview no-ops when unchanged', () => {
    const s = defaultState()
    expect(R.setPlanPreview(s, s.planPreview)).toBe(s)
  })
})
