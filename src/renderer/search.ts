// Shared fuzzy search core for quick-open (⌘P) and the Search sidebar view.
// Subsequence scorer, top-N results — cmdk renders, we filter (20k+ files
// would choke cmdk's built-in filter).

import { useEffect, useMemo, useState } from 'react'
import type { PersistedTab, ProjectGroup } from '@shared/types'
import { useStore } from './store'
import { useRuntime } from './state/runtime'

export interface FileHit {
  kind: 'file'
  project: ProjectGroup
  relPath: string
  absPath: string
  score: number
}

export interface SessionHit {
  kind: 'session'
  tab: PersistedTab
  label: string
  score: number
}

export type SearchHit = FileHit | SessionHit

// Subsequence match with word/segment-boundary + consecutive bonuses.
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (q.length === 0) return 1
  let qi = 0
  let score = 0
  let streak = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      const boundary = ti === 0 || '/-_. '.includes(t[ti - 1])
      streak++
      score += 1 + streak * 2 + (boundary ? 8 : 0)
      qi++
    } else {
      streak = 0
    }
  }
  if (qi < q.length) return 0 // not all query chars found
  return score / (1 + t.length / 64) // mild length penalty
}

const listCache = new Map<string, string[]>()

export function useFileIndex(active: boolean): Map<string, string[]> {
  const projects = useStore((s) => s.state.projects)
  const [, bump] = useState(0)

  useEffect(() => {
    if (!active) return
    let alive = true
    for (const p of projects) {
      void window.telchar.fs
        .listFiles(p.path)
        .then((res) => {
          if (!alive) return
          listCache.set(p.id, res.files)
          bump((n) => n + 1)
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [active, projects])

  return listCache
}

export function useSearchHits(query: string, active: boolean, limit = 50, scopeProjectId?: string): SearchHit[] {
  const allProjects = useStore((s) => s.state.projects)
  const tabs = useStore((s) => s.state.tabs)
  const oscTitles = useRuntime((s) => s.byTab)
  const index = useFileIndex(active)
  const projects = scopeProjectId ? allProjects.filter((p) => p.id === scopeProjectId) : allProjects

  return useMemo(() => {
    if (!active) return []
    const hits: SearchHit[] = []
    // Sessions first-class: jumping beats opening files in this app.
    for (const tab of Object.values(tabs)) {
      if (tab.kind === 'empty') continue
      if (!projects.some((p) => p.id === tab.projectId)) continue
      const project = projects.find((p) => p.id === tab.projectId)
      const osc = oscTitles[tab.id]?.oscTitle
      const label = `${project?.name ?? ''} ${tab.title} ${osc ?? ''}`.trim()
      const score = fuzzyScore(query, label)
      if (score > 0) hits.push({ kind: 'session', tab, label: osc || tab.title, score: score * 1.5 })
    }
    for (const project of projects) {
      const files = index.get(project.id) ?? []
      for (const relPath of files) {
        const score = fuzzyScore(query, `${project.name}/${relPath}`)
        if (score > 0) {
          hits.push({ kind: 'file', project, relPath, absPath: `${project.path}/${relPath}`, score })
          if (hits.length > 5000) break // scoring bound under huge indexes
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `projects` derives from these
  }, [query, active, allProjects, scopeProjectId, tabs, oscTitles, index, limit])
}
