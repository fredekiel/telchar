// Instant styled tooltips (radix). Wrap the app once in TooltipProvider.

import * as RT from '@radix-ui/react-tooltip'

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <RT.Provider delayDuration={300} skipDelayDuration={200}>
    {children}
  </RT.Provider>
)

export function Tooltip({
  label,
  side = 'right',
  children
}: {
  label: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: React.ReactNode
}) {
  return (
    <RT.Root>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content
          side={side}
          sideOffset={6}
          className="z-[60] rounded-md border border-border bg-panel px-2 py-1 text-[11px] text-fg shadow-xl select-none"
        >
          {label}
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  )
}
