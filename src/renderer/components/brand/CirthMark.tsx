// Brand marks: Telchar's cirth (Angerthas Daeron), stroke-drawn with
// currentColor so surfaces tint them (ember for brand accents). Glyph
// geometry and sources live in BRAND.md — keep the two in sync.

// Certh 8 — the letter T, the brand glyph (matches the app icon).
export function Certh8({ className }: { className?: string }) {
  return (
    <svg viewBox="-6 -6 84 112" className={className} aria-hidden="true">
      <path
        d="M12 0 L12 100 M12 4 L62 28"
        fill="none"
        stroke="currentColor"
        strokeWidth="11"
        strokeLinecap="round"
      />
    </svg>
  )
}

// TELCHAR in cirth 8 46 31 20 48 29 — the hallmark row (see BRAND.md).
const TELCHAR_GLYPHS = [
  'M12 0 L12 100 M12 4 L62 28', // T  (8)
  'M12 0 L12 100 M60 0 L60 100 M12 35 L60 59', // E  (46)
  'M36 0 L36 100 M10 58 L62 37', // L  (31)
  'M60 0 L60 100 M8 3 L60 63', // CH (20)
  'M12 0 L12 100 M12 4 L60 35 M60 35 L60 100', // A  (48)
  'M12 0 L12 100 M12 46 L64 7 M12 46 L64 93' // R  (29)
]

export function CirthTelchar({ className }: { className?: string }) {
  return (
    <svg viewBox="-6 -6 514 112" className={className} aria-hidden="true">
      {TELCHAR_GLYPHS.map((d, i) => (
        <path
          key={d}
          d={d}
          transform={`translate(${i * 86} 0)`}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}
