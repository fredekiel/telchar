// Lucide icon catalog + the `lucide:<kebab-name>` storage convention for
// tab/layout icons. Anything in `icon` without the prefix is an emoji grapheme.

import { icons, type LucideIcon } from 'lucide-react'

export const LUCIDE_PREFIX = 'lucide:'

// 'AArrowDown' -> 'a-arrow-down', 'Columns2' -> 'columns-2'
function kebab(pascal: string): string {
  return pascal
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

const byName = new Map<string, LucideIcon>()
for (const [pascal, Icon] of Object.entries(icons)) byName.set(kebab(pascal), Icon)

export const LUCIDE_CATALOG: ReadonlyArray<{ name: string; Icon: LucideIcon }> = [...byName.entries()]
  .map(([name, Icon]) => ({ name, Icon }))
  .sort((a, b) => a.name.localeCompare(b.name))

// 'lucide:flame' -> Flame component; emoji or unknown name -> undefined.
export function lucideIcon(icon: string): LucideIcon | undefined {
  if (!icon.startsWith(LUCIDE_PREFIX)) return undefined
  return byName.get(icon.slice(LUCIDE_PREFIX.length))
}

// Shown when the picker's search is empty. Filtered against the live map so a
// lucide upgrade renaming an icon drops it here instead of crashing the grid.
const CURATED_NAMES = [
  'terminal', 'square-terminal', 'code', 'braces', 'bug', 'rocket', 'flame', 'zap',
  'sparkles', 'star', 'heart', 'bot', 'cpu', 'database', 'server', 'cloud',
  'globe', 'folder', 'file-text', 'book-open', 'bookmark', 'bell', 'shield', 'lock',
  'key', 'wrench', 'hammer', 'anvil', 'settings', 'package', 'box', 'git-branch',
  'git-merge', 'git-pull-request', 'container', 'layers', 'layout-grid', 'monitor', 'palette', 'brush',
  'pencil', 'eye', 'search', 'flag', 'tag', 'target', 'timer', 'clock',
  'calendar', 'house', 'inbox', 'mail', 'message-square', 'lightbulb', 'brain', 'atom',
  'flask-conical', 'test-tube', 'gem', 'crown', 'trophy', 'gift', 'coffee', 'gamepad-2',
  'music', 'map', 'compass', 'sun', 'moon', 'leaf', 'skull', 'ghost'
]

export const CURATED: ReadonlyArray<{ name: string; Icon: LucideIcon }> = CURATED_NAMES.flatMap((name) => {
  const Icon = byName.get(name)
  return Icon ? [{ name, Icon }] : []
})
