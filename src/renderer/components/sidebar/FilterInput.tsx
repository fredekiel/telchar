// Small always-visible filter input shared by the sidebar views.
// Transient UI state only — the query lives in the owning view's useState.

import { Search, X } from 'lucide-react'

export function FilterInput({
  value,
  onChange,
  placeholder = 'Filter…',
  className = 'px-2 pb-2'
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={className}>
      <div className="relative">
        <Search size={12} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-dim" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onChange('')
              e.currentTarget.blur()
            }
          }}
          placeholder={placeholder}
          className="w-full rounded border border-border bg-bg py-1.5 pr-6 pl-6 text-fg outline-none placeholder:text-dim focus:border-accent"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute top-1/2 right-1.5 flex -translate-y-1/2 cursor-pointer items-center rounded p-0.5 text-dim hover:text-fg"
            title="Clear filter"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  )
}
