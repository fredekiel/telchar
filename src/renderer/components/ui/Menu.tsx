// Dropdown menu (radix) styled to the app palette.

import * as RD from '@radix-ui/react-dropdown-menu'

export const Menu = RD.Root
export const MenuTrigger = RD.Trigger

export function MenuContent({
  children,
  align = 'start'
}: {
  children: React.ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <RD.Portal>
      <RD.Content
        align={align}
        sideOffset={6}
        className="z-[60] min-w-[200px] rounded-lg border border-border bg-panel p-1.5 text-[12.5px] text-fg shadow-2xl"
      >
        {children}
      </RD.Content>
    </RD.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  disabled
}: {
  children: React.ReactNode
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <RD.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none select-none data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[highlighted]:bg-panelhi"
    >
      {children}
    </RD.Item>
  )
}

export function MenuSeparator() {
  return <RD.Separator className="my-1 h-px bg-border" />
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <RD.Label className="px-3 py-1 text-[10px] font-semibold tracking-widest text-dim">{children}</RD.Label>
}
