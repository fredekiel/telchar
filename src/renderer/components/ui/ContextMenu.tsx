// Right-click context menu (radix) styled to the app palette — same surface
// and item classes as Menu.tsx. Includes the shared tab/layout color swatch row.

import * as RC from '@radix-ui/react-context-menu'
import { Ban, ChevronRight } from 'lucide-react'
import { TAB_COLORS } from '@shared/types'

export const ContextMenu = RC.Root
export const ContextMenuTrigger = RC.Trigger

export function ContextMenuContent({ children }: { children: React.ReactNode }) {
  return (
    <RC.Portal>
      <RC.Content
        // Rename/Set-icon items hand focus to an inline input — radix must not
        // steal it back when the menu closes.
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="z-[60] min-w-[200px] rounded-lg border border-border bg-panel p-1.5 text-[12.5px] text-fg shadow-2xl"
      >
        {children}
      </RC.Content>
    </RC.Portal>
  )
}

export function ContextMenuItem({
  children,
  onSelect,
  disabled
}: {
  children: React.ReactNode
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <RC.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none select-none data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[highlighted]:bg-panelhi"
    >
      {children}
    </RC.Item>
  )
}

export function ContextMenuSeparator() {
  return <RC.Separator className="my-1 h-px bg-border" />
}

export const ContextMenuSub = RC.Sub

export function ContextMenuSubTrigger({ children }: { children: React.ReactNode }) {
  return (
    <RC.SubTrigger className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none select-none data-[highlighted]:bg-panelhi data-[state=open]:bg-panelhi">
      <span className="flex-1">{children}</span>
      <ChevronRight size={13} className="text-dim" />
    </RC.SubTrigger>
  )
}

export function ContextMenuSubContent({ children }: { children: React.ReactNode }) {
  return (
    <RC.Portal>
      <RC.SubContent
        sideOffset={4}
        className="z-[60] min-w-[160px] rounded-lg border border-border bg-panel p-1.5 text-[12.5px] text-fg shadow-2xl"
      >
        {children}
      </RC.SubContent>
    </RC.Portal>
  )
}

// Swatch row for tab/layout tints — swatches styled after ProjectsView's
// project color picker. `undefined` from the Ban button clears the color.
export function ColorSwatchRow({
  value,
  onPick
}: {
  value: string | undefined
  onPick: (color: string | undefined) => void
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {TAB_COLORS.map((c) => (
        <RC.Item key={c} asChild onSelect={() => onPick(c)}>
          <button
            className="h-4 w-4 cursor-pointer rounded-full outline-none ring-offset-1 ring-offset-panel data-[highlighted]:ring-2 data-[highlighted]:ring-fg/60"
            style={{ background: c, outline: c === value ? '2px solid var(--color-fg)' : 'none' }}
          />
        </RC.Item>
      ))}
      <RC.Item asChild onSelect={() => onPick(undefined)}>
        <button
          title="No color"
          className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-dim outline-none data-[highlighted]:text-fg"
        >
          <Ban size={13} />
        </button>
      </RC.Item>
    </div>
  )
}
