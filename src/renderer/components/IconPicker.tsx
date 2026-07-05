// Searchable lucide-icon grid. Popover content only — the parent owns the
// controlled Popover and commits via onPick with 'lucide:<name>'. (Legacy
// emoji values still render via DecorIcon; they just can't be picked here.)

import { useMemo, useState } from 'react'
import { CURATED, LUCIDE_CATALOG, LUCIDE_PREFIX } from '../icons'

const MAX_RESULTS = 200

export function IconPicker({
  value,
  color,
  onPick
}: {
  value?: string
  color?: string
  onPick: (icon: string) => void
}) {
  const [q, setQ] = useState('')

  const { results, overflow } = useMemo(() => {
    const nq = q.trim().toLowerCase().replace(/\s+/g, '-')
    if (!nq) return { results: CURATED, overflow: 0 }
    const bare = nq.replace(/-/g, '')
    const all = LUCIDE_CATALOG.filter((i) => i.name.includes(nq) || i.name.replace(/-/g, '').includes(bare))
    return { results: all.slice(0, MAX_RESULTS), overflow: Math.max(0, all.length - MAX_RESULTS) }
  }, [q])

  return (
    <div className="flex flex-col">
      <input
        autoFocus
        value={q}
        placeholder="Search icons…"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) onPick(LUCIDE_PREFIX + results[0].name)
          if (e.key !== 'Escape') e.stopPropagation()
        }}
        className="w-full border-b border-border bg-transparent px-3.5 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim"
      />
      {results.length === 0 ? (
        <div className="px-3 py-4 text-dim">No matching icon.</div>
      ) : (
        <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto p-2">
          {results.map(({ name, Icon }) => (
            <button
              key={name}
              title={name}
              onClick={() => onPick(LUCIDE_PREFIX + name)}
              className={
                'flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-panelhi' +
                (value === LUCIDE_PREFIX + name ? ' ring-1 ring-accent' : '')
              }
            >
              <Icon size={15} style={color ? { color } : undefined} />
            </button>
          ))}
        </div>
      )}
      {overflow > 0 && <div className="px-3 pb-1.5 text-[10px] text-dim">+{overflow} more — keep typing</div>}
    </div>
  )
}
