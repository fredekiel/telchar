import { describe, expect, it } from 'vitest'
import { CURATED, LUCIDE_CATALOG, LUCIDE_PREFIX, lucideIcon } from '../src/renderer/icons'

describe('lucide icon catalog', () => {
  it('resolves a known lucide: value', () => {
    expect(lucideIcon('lucide:flame')).toBeDefined()
  })

  it('returns undefined for emoji and unknown names', () => {
    expect(lucideIcon('🔥')).toBeUndefined()
    expect(lucideIcon('lucide:not-a-real-icon')).toBeUndefined()
    expect(lucideIcon('')).toBeUndefined()
  })

  it('kebab-cases digit and leading-caps-run names', () => {
    // Columns2 -> columns-2, AArrowDown -> a-arrow-down
    expect(lucideIcon('lucide:columns-2')).toBeDefined()
    expect(lucideIcon('lucide:a-arrow-down')).toBeDefined()
  })

  it('has a full-size catalog with prefix-free kebab names', () => {
    expect(LUCIDE_CATALOG.length).toBeGreaterThan(1000)
    for (const { name } of LUCIDE_CATALOG.slice(0, 50)) {
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      expect(name.startsWith(LUCIDE_PREFIX)).toBe(false)
    }
  })

  it('keeps the curated set fully resolvable (fails on a lucide rename)', () => {
    expect(CURATED.length).toBe(72)
    for (const { name, Icon } of CURATED) {
      expect(Icon, `curated icon ${name} missing from lucide`).toBeDefined()
      expect(lucideIcon(LUCIDE_PREFIX + name)).toBe(Icon)
    }
  })
})
