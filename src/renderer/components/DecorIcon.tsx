// User-picked tab/layout icon: `lucide:<name>` renders the lucide glyph
// (tinted with the decor color when set), anything else renders as an emoji
// grapheme. Unknown lucide names render nothing — never crash, and "Remove
// icon" stays reachable since the stored value is still truthy.

import { LUCIDE_PREFIX, lucideIcon } from '../icons'

export function DecorIcon({ icon, color, size = 13 }: { icon: string; color?: string; size?: number }) {
  const Icon = lucideIcon(icon)
  if (Icon) return <Icon size={size} className="shrink-0" style={color ? { color } : undefined} />
  if (icon.startsWith(LUCIDE_PREFIX)) return null
  return (
    <span className="shrink-0 leading-none" style={{ fontSize: size }}>
      {icon}
    </span>
  )
}
