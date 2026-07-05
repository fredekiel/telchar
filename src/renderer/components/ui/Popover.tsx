// Anchored popover (radix) styled to the app palette.

import * as RP from '@radix-ui/react-popover'

export const Popover = RP.Root
export const PopoverTrigger = RP.Trigger
export const PopoverAnchor = RP.Anchor

export function PopoverContent({
  children,
  align = 'start',
  matchTriggerWidth = true,
  className = ''
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
  matchTriggerWidth?: boolean
  className?: string
}) {
  return (
    <RP.Portal>
      <RP.Content
        align={align}
        sideOffset={6}
        className={`z-[60] ${matchTriggerWidth ? 'w-[var(--radix-popover-trigger-width)]' : ''} min-w-[220px] overflow-hidden rounded-lg border border-border bg-panel text-[12.5px] text-fg shadow-2xl ${className}`}
      >
        {children}
      </RP.Content>
    </RP.Portal>
  )
}
