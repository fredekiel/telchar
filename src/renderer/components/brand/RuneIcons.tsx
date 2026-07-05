// Sidebar view icons drawn in the cirth stroke language: straight segments
// only, chisel diagonals near the certh-8 branch angle (~25°), no curves.
// Concept silhouettes stay recognizable (terminal, doc, files, branch,
// folder, lens) — these are NOT letters; literal cirth would be unreadable
// as navigation (see BRAND.md placement rules).

type IconProps = { size?: number; strokeWidth?: number; className?: string }

function Rune({
  size = 24,
  strokeWidth = 1.75,
  className,
  children
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// Sessions — prompt chevron + input stroke.
export function RuneTerminal(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M5 7 L11 12 L5 17" />
      <path d="M13 17 L19 17" />
    </Rune>
  )
}

// Plans — stone tablet, chisel-cut corner, slanted rune lines.
export function RunePlan(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M7 3 L14.5 3 L17 5.5 L17 21 L7 21 Z" />
      <path d="M9.5 9.5 L14.5 8.3" />
      <path d="M9.5 13.5 L14.5 12.3" />
      <path d="M9.5 17.5 L12.5 16.8" />
    </Rune>
  )
}

// Files — two chisel-cut sheets.
export function RuneFiles(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M9.5 6.5 L9.5 3 L15.5 3 L18 5.5 L18 17 L15 17" />
      <path d="M6 6.5 L12.5 6.5 L15 9 L15 21 L6 21 Z" />
    </Rune>
  )
}

// Git — stem with a certh-angle branch, diamond nodes.
export function RuneGit(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M7 6.5 L7 17.5" />
      <path d="M7 12.5 L15.2 8.2" />
      <path d="M7 2.6 L8.9 4.5 L7 6.4 L5.1 4.5 Z" />
      <path d="M7 17.6 L8.9 19.5 L7 21.4 L5.1 19.5 Z" />
      <path d="M16.6 3.6 L18.5 5.5 L16.6 7.4 L14.7 5.5 Z" />
    </Rune>
  )
}

// Projects — angular folder, chisel tab.
export function RuneFolder(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M3.5 6 L9 6 L11.5 8.5 L20.5 8.5 L20.5 19 L3.5 19 Z" />
    </Rune>
  )
}

// Search — diamond lens, diagonal haft.
export function RuneSearch(props: IconProps) {
  return (
    <Rune {...props}>
      <path d="M10.5 4 L17 10.5 L10.5 17 L4 10.5 Z" />
      <path d="M15.6 15.6 L20 20" />
    </Rune>
  )
}
