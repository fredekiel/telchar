# Telchar — brand

## The name

**Telchar** was the greatest smith of the Dwarves in Tolkien's legendarium — a master of Nogrod in the Blue Mountains, First Age, student of Gamil Zirak the old.

> "…none…surpassed the craftsmen of Nogrod, of whom Telchar the smith was greatest in renown." — *The Silmarillion*, "Of the Sindar"

His three attested works, each of which decided history:

| Work | Deed | Source |
|---|---|---|
| **Narsil** | The sword that cut the One Ring from Sauron's hand. "Telchar first wrought it in the deeps of time." — Aragorn | *The Two Towers*, III 6 |
| **Angrist** | The knife that cut a Silmaril from Morgoth's crown; "iron it would cleave as if it were green wood" | *The Silmarillion*, ch. 19 |
| **Dragon-helm of Dor-lómin** | Guarded Túrin; "of grey steel adorned with gold, and on it were graven runes of victory" | *Unfinished Tales*, Narn i Hîn Húrin |

Why the name fits: a tool for forging and driving many Claude Code sessions, named for a master-smith whose forge-work outlived ages. And the runes below aren't decoration — **a Telchar work canonically bears graven runes.**

Nogrod: Sindarin "Hollowbold" (older form *Novrod*, "hollow delving"); Khuzdul **Tumunzahar**.

## Tagline

> **One forge. Many sessions.**

## The wordmark: TELCHAR in cirth

The Cirth were devised by **Daeron of Doriath**; the Dwarves of Nogrod — Telchar's city — "learned them, and were well-pleased with the device" (*The Silmarillion*, "Of the Sindar"). Telchar is First Age, so the correct mode is **Angerthas Daeron** (the Moria rearrangement is Second Age). Glyph shapes are identical across modes; only sound values moved.

**TELCHAR = cirth 8 · 46 · 31 · 20 · 48 · 29** (T · E · L · CH · A · R)

Rules (get these right or the wordmark reads wrong):

- **CH** in Telchar is the *loch* sound [x] → **certh 20 (kh)**, NOT certh 13 (the *church* affricate).
- **R** is certh **29** in Angerthas Daeron/Erebor. Certh 12 (the ᛏ-like up-arrow) is R only in the Moria mode — and looks like the Tiwaz "T" rune, a trap we fell into once. Don't use it.
- Cirth design language: **straight strokes only** — verticals + diagonals at ~20–50°, uniform weight, no curves, no horizontals. Carve-friendly. Each glyph ≈ 0.72 width-to-height.

### Glyph geometry (stroke centerlines, 72×100 box, y=0 top / y=100 baseline)

SVG paths, stroke-drawn (`fill="none"`, round or butt caps, weight ≈ 8–10/100):

| Letter | Certh | Path |
|---|---|---|
| T | 8 | `M12 0 L12 100 M12 4 L62 28` |
| E | 46 | `M12 0 L12 100 M60 0 L60 100 M12 35 L60 59` |
| L | 31 | `M36 0 L36 100 M10 58 L62 37` |
| CH | 20 | `M60 0 L60 100 M8 3 L60 63` |
| A | 48 | `M12 0 L12 100 M12 4 L60 35 M60 35 L60 100` |
| R | 29 | `M12 0 L12 100 M12 46 L64 7 M12 46 L64 93` |

**Certh 8 alone is the brand glyph** (the "T" mark used in the app icon). The six-glyph row is the full wordmark — use it as a hallmark strike under logos, on splash/about screens, in docs headers.

### Sources

- Letter values: J.R.R. Tolkien, *The Lord of the Rings*, **Appendix E**, "The Cirth" / Angerthas table.
- Shape data: Wikimedia Commons `Certh_N.svg` tracings of the Appendix E chart (files 8, 46, 31, 20, 48, 29), cross-checked against [Wikipedia: Cirth](https://en.wikipedia.org/wiki/Cirth), [Omniglot](https://www.omniglot.com/conscripts/cirth.htm), and the [ConScript Unicode Registry](https://www.evertype.com/standards/csur/cirth.html).
- Cirth is **not** in official Unicode (CSUR private-use U+E080–E0FF only; Everson's 1997 proposal WG2 N1642 stalled). The three "Tolkienian" runes added in Unicode 7.0 (U+16F1–16F3) are Hobbit-map Anglo-Saxon runes, not Cirth. Ship glyphs as SVG, never as text.

## Color

Tokyo Night base (see `src/renderer/styles.css` `@theme`), plus the brand accent:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--color-ember` | `#ff9e64` | `#b15c00` | Forge ember — brand accent ONLY (boot glyph, empty-state motifs, rune glow). **Never for attention states** — those colors are locked (see CLAUDE.md UX rules). |
| Ember glow ramp | `#ff7a3c` → `#ff9e64` → `#ffd9a0` → `#fff0d4` | — | Hot-metal glow layering in icon/marks: wide soft outer → tight → stroke → white-hot core |
| Icon steel | `#98a3cd` → `#4b5480` → `#262c4a` (vertical gradient) | — | Anvil/steel surfaces in the mark |
| Icon plate | `#2b2f45` → `#111119`, rim `#3a3f5c` | — | Squircle background of the app icon |

## Voice

The metaphor map (used in empty states; see CLAUDE.md UX rules for hard limits):

- the app = the **smithy** · layouts = **forges** · panes/tabs = **anvils** · sessions = the **work**
- Flavor lives in empty states and brand surfaces only. Errors, persistence notices, palette/menu labels, and the attention system stay plain and functional.
- Current copy: "The forge is cold" (zero projects) · "This forge sits empty" (empty layout) · "Empty anvil — pick what to forge here" (empty tab).

### In-app brand placements

Reusable marks: `src/renderer/components/brand/CirthMark.tsx` (`Certh8`, `CirthTelchar` — currentColor, tint with `text-ember`). Runic sidebar icons: `src/renderer/components/brand/RuneIcons.tsx`.

**The three-hue rule** (the color grammar of the chrome):
- **Ember** = selection & identity — where you ARE: activity-bar active stripe, active pane-tab top line, active layout-pill stripe, terminal cursor, brand marks.
- **Accent blue** = interaction & focus — what you're DOING: focus rings, form controls, hovers, drag-over, links, busy pulse.
- **Amber** = attention — what NEEDS you: needs-input glyphs/badges/status. Locked; nothing else may read amber-adjacent in attention positions.

| Surface | Mark | Treatment |
|---|---|---|
| Activity bar view icons | runic icon set (`RuneIcons.tsx`) | cirth stroke language: straight segments, chisel diagonals |
| Activity bar active stripe · dockview active-tab top line · active layout pill stripe | — | `--color-ember` |
| Terminal cursor | — | ember (`#ff9e64` dark / `#b15c00` light, `theme.ts`) |
| Status bar, far left | certh 8 | `text-ember/70`, tagline in tooltip |
| Settings, about block | certh 8 + name/tagline + hallmark row | ember / dim ember |
| Keybinds help, footer | hallmark row | `text-ember/40` |
| Empty states (zero-project, empty layout, empty tab) | lucide `Anvil` | `text-ember` |
| Boot loader | lucide `Flame` | `text-ember`, pulse |

Placement rules: **literal cirth are never functional icons** (they're letters, not concepts — at 24px all six read alike). The sanctioned form for functional icons is the **runic-styled concept set** in `RuneIcons.tsx`: recognizable silhouettes (terminal, doc, sheets, branch, folder, lens) drawn in the cirth stroke language — straight strokes only, certh-angle diagonals, no curves. Ember never sits where amber attention lives.

## Assets

- **App icon — "The Hallmark"**: certh 8 burning hot, TELCHAR struck beneath in six cooling cirth. Source `build/icon.svg`; 1024×1024 export `build/icon.png`, wired via `mac.icon` in `electron-builder.yml`.
- **Brand logo — "Smith's Mark"**: `assets/brand/smiths-mark.svg`. A stylized rune-form mark for branding surfaces (docs, site, social). **Not a real certh** — decorative only; anywhere authenticity matters, use certh 8 or the cirth wordmark instead.
- Icon exploration gallery + rationale: the "Telchar icon" artifact (rounds 1–4).
