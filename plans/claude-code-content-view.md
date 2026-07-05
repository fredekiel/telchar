# Plan: Telchar "Content View" — cloning the Claude Code VSCode panel's rich UI

> Status: **research complete, not started.** Low-upkeep render-layer path chosen; graphical
> chat clone rejected on maintenance grounds. Resume by reading this file top-to-bottom.

## Context / why

The user asked what the Claude Code VSCode extension is technically made of, whether its nice
interactions (stylized windows, attach images/files, markdown display, code highlighting) can
be built into Telchar, and whether we can clone it. Telchar today runs Claude Code as raw
xterm.js terminal sessions. The user wants a nicer *rendered* surface like VSCode's panel —
**but low maintenance**, and without VSCode's annoyances (sticky input window that obscures
the conversation; no simple button to re-open a plan file).

This plan captures the full web research (adversarially verified) + a Telchar codebase map +
the chosen approach, so it can be executed later without re-researching.

---

## Part A — Web research findings (verified)

Method: deep-research workflow, 5 search angles → 22 sources fetched → 94 claims →
25 verified via 3-vote adversarial checks → 23 confirmed, 2 refuted.

### What the official Claude Code VSCode extension is

1. **Standard VSCode extension.** VSCode 1.98+, installed via Marketplace / Open VSX, also
   works in forks like Cursor. Bundles a **private copy of the `claude` CLI** as its engine.
   Graphical chat panel by **default** (not a terminal); optional `useTerminal` setting
   (default false) switches to CLI mode. The bundled binary is separate from a standalone
   `claude` CLI install.
   - Confidence: high (3-0). Sources: https://code.claude.com/docs/en/vs-code ,
     https://github.com/anthropics/claude-code/issues/50408
   - Evidence: docs — "The VS Code extension provides a native graphical interface... the
     recommended way"; "By default, the extension opens a graphical chat panel. If you prefer
     the CLI-style interface, open the Use Terminal setting"; "The extension bundles a private
     copy of the CLI for its chat panel."

2. **Three-layer architecture.** webview panel (UI) ↔ local `ide` MCP server
   (`127.0.0.1`, random high port, fresh per-session auth token) ↔ bundled `claude` CLI
   (engine). The panel drives the CLI via a **structured protocol (MCP / stream-json)** — it
   does NOT scrape terminal text.
   - Source: official docs (search-snippet level; treat as strong but confirm exact wording
     when building).

3. **The "native" panel is a VSCode webview** — an iframe running an HTML/CSS/JS **React
   app**, communicating with the extension host via message passing. NOT native OS widgets.
   Theming matches the editor via injected CSS theme variables.
   - Confidence: high (3-0). Sources:
     https://code.visualstudio.com/api/extension-guides/webview ,
     https://github.com/Saqoosha/Canopy , https://github.com/andrepimenta/claude-code-chat ,
     https://blog.mattbierner.com/vscode-webview-web-learnings/
   - Evidence: VSCode API — "Think of a webview as an iframe within VS Code... can render
     almost any HTML content... communicates with extensions using message passing." Canopy
     tagline — "Claude Code's full React UI in a WKWebView."

4. **Editor-decoupled / portable.** Canopy runs the extension's **unmodified `extension.js`**
   in a Node.js subprocess behind a ~10-module `vscode` shim that intercepts
   `require('vscode')` and bridges the webview via NDJSON over stdin/stdout. A ~10-module shim
   sufficing to host it proves it's a standard, decoupled webview extension.
   - Confidence: high (3-0). Source: https://github.com/Saqoosha/Canopy

5. **Official source is CLOSED.** Not on GitHub, no license permitting code reuse. But fully
   open-source **functional equivalents** exist — study for patterns, do not copy code:
   - https://github.com/andrepimenta/claude-code-chat (JS 62.6% / TS 36.9%, active, on Open VSX)
   - https://github.com/Harsh1210/openclaude-vscode (React + Tailwind webview)
   - https://github.com/Saqoosha/Canopy (hosts the real extension.js; Prism + theme CSS)
   - https://github.com/siteboon/claudecodeui
   - REFUTED (0-3): project-copilot/claude-dev (Cline) is NOT a reusable source for this —
     claims about its webview-ui dir / MIT-reusable rendering code failed verification.

### Feature techniques — all commodity web tech, run fine in an Electron renderer

6. **Feature set is standard and clonable** (from community extensions' READMEs): enhanced
   markdown w/ syntax highlighting, code highlighting in diff views, copy-to-clipboard on code
   blocks, one-click message copy, streaming chat rendering. (3-0)

7. **Streaming markdown:**
   - Vercel **Streamdown** — "drop-in replacement for react-markdown, designed for AI-powered
     streaming"; bundles Shiki highlighting w/ copy/download buttons, line numbers, 200+
     languages, KaTeX, Mermaid. Sources: https://streamdown.ai/ ,
     https://github.com/vercel/streamdown , https://streamdown.ai/docs/code-blocks (3-0)
   - **react-markdown** — builds a React vDOM from a syntax tree (no
     `dangerouslySetInnerHTML` → XSS-safe), extended via remark/rehype (GFM,
     rehype-sanitize); code highlight by overriding the `code` component with
     react-syntax-highlighter keyed on the `language-*` class. Source:
     https://github.com/remarkjs/react-markdown (3-0)

8. **Syntax highlighting — Shiki recommended:**
   - `@shikijs/markdown-it` — official markdown-it plugin. https://shiki.style/packages/markdown-it
   - `react-shiki` — `<ShikiHighlighter>` component + `useShikiHighlighter` hook; **purpose-built
     for streamed LLM code with optional throttling** (nextAllowedTime watermark).
     https://github.com/AVGVSTVS96/react-shiki
   - Base engine: https://github.com/shikijs/shiki  (all 3-0)
   - Prism alternative proven on the real extension: Canopy ships `prism-canopy.css` +
     `canopy-overrides.css`, loading 456 VSCode CSS variables. (3-0)

9. **Image/file attachment** (clonable pattern from claude-code-chat): paste-with-thumbnail
   preview, native file picker, preview strip above input with remove buttons, inline image
   paths auto-detected + sent as base64. In Electron → standard File API / HTML5 drag-drop /
   `dialog.showOpenDialog`. (3-0)
   - Electron specifics (from fetched sources): dragging files INTO the app uses standard
     HTML5 DnD (no Electron-specific code); must register a `dragover` listener calling
     `preventDefault()` or `drop` never fires; clipboard paste of desktop *files* is not
     exposed by the Clipboard API (pasted *images* work via `onPaste` clipboard-data
     iteration). Sources: electronjs.org native-file-drag-drop docs; medium/poeticgeek paste
     guides.

10. **Styled panels.** VSCode's own UX guidelines *discourage* custom webviews (native Tree
    Views preferred) because webviews are resource-heavy + separate-context — but this is a
    VSCode-platform constraint that **does NOT apply to Electron**, where the renderer is
    already a full Chromium HTML surface (no iframe sandbox, no restrictive CSP). So the same
    features are *easier* in Telchar than in a VSCode extension. Sources:
    https://code.visualstudio.com/api/ux-guidelines/views ,
    https://code.visualstudio.com/api/ux-guidelines/webviews (3-0)

### Refuted claims (do NOT rely on)
- "The extension's UI is a webview-ui dir in project-copilot/claude-dev" — 0-3.
- "Full source open under MIT, legally reusable" — 0-3.

### Caveats
- Architectural evidence about the *official* extension is third-party reverse-engineering
  (Canopy) — credible (runs real extension.js) but indirect. Anthropic docs confirm
  webview + bundled CLI; internal lib choices (Shiki vs Prism vs highlight.js; react-markdown
  vs custom) are **unverified**.
- Feature-level claims come largely from community extensions' self-descriptive READMEs.
- JS ecosystem moves fast — verify current Shiki / Streamdown / react-shiki / react-markdown
  APIs before building.
- Attachment evidence centers on **images**; arbitrary non-image file attachment is less
  documented.

### Open questions (unresolved by research)
- Exact libs Anthropic's official extension uses internally for markdown + highlighting.
- Whether official extension attaches arbitrary files (PDFs/docs) vs images only, and the
  transmission format.
- If a graphical content view were ever built: it would drive `claude` in stream-json output
  mode (like Canopy via the CLI) rather than parsing terminal output — exact IPC shape TBD.
- Streaming perf with many concurrent content views (Shiki WASM/bundle cost → lazy-load per
  pane?).

---

## Part B — Telchar codebase map (what already exists to reuse)

Telchar is ~90% equipped for the render layer. Reuse, don't rebuild.

| Need | Already present | Location |
|---|---|---|
| Live markdown render | `react-markdown` + `remark-gfm` + `rehype-highlight`, file-watched, tail toggle | [src/renderer/components/PlanView.tsx](../src/renderer/components/PlanView.tsx) |
| Plan listing (per project) | `window.telchar.markdown.listPlans()` / `plansForProject()`; click → `openPlan` | [src/renderer/components/sidebar/PlansView.tsx](../src/renderer/components/sidebar/PlansView.tsx) |
| Code viewer | read-only CodeMirror 6, lang auto-detect, theme-aware | [src/renderer/components/FileView.tsx](../src/renderer/components/FileView.tsx) |
| Pane-kind switch (PLUG-IN POINT) | `TabBodyInner` switches `tab.kind`, `never` exhaustiveness check | [src/renderer/components/dock/DockHost.tsx](../src/renderer/components/dock/DockHost.tsx) ~L73-95 |
| Tab-kind union | `PersistedTab = TerminalTab \| PlanTab \| FileTab \| EmptyTab` | [src/shared/types.ts](../src/shared/types.ts) L44-93 |
| Tab-creation thunks | `newTerminal`/`openPlan`/`openFile`/`newEmptyTab` → shared `addTabToLayout` | [src/renderer/store.ts](../src/renderer/store.ts) L192/208/233/355 |
| Panel wiring | `renderer:'always'` keeps DOM across tab switches | [src/renderer/components/dock/adapter.ts](../src/renderer/components/dock/adapter.ts) L54/61 |
| Crash containment | per-pane `ErrorBoundary` wraps every body | [src/renderer/components/ErrorBoundary.tsx](../src/renderer/components/ErrorBoundary.tsx) |
| Theme tokens | Tailwind v4 `@theme` (bg-bg/bg-panel/accent/…), light override, `.plan-content` MD CSS | [src/renderer/styles.css](../src/renderer/styles.css) @theme + L128-151 |
| UI primitives | radix wrappers (Tooltip/Menu/Popover/ContextMenu), lucide, cmdk | [src/renderer/components/ui/](../src/renderer/components/ui/) |

**Already-installed libs (package.json):** `react-markdown@9`, `remark-gfm@4`,
`rehype-highlight@7`, `codemirror` + `@codemirror/language-data` + `@codemirror/theme-one-dark`,
radix set, `lucide-react`, `cmdk`, `dockview-react@7`, `zustand`, `@xterm/*`,
`class-variance-authority`/`clsx`/`tailwind-merge`.

**Gaps to fill:**
- No image/attachment component or lightbox; no drag-drop attach handling.
- **No colored code theme imported** — `rehype-highlight` emits `hljs`-classed spans but no
  token-color CSS is loaded, so markdown code blocks currently render monochrome. Fix: import
  an hljs theme scoped to `.plan-content`, or switch to Shiki/`react-shiki`.
- No stream-json driver (only needed for the rejected chat-clone).

---

## Part C — Upkeep analysis (decisive)

- **Terminal (today): ~zero Claude-coupled upkeep.** Telchar pipes bytes to xterm; the
  `claude` TUI is Anthropic's concern.
- **Graphical chat clone: HIGH, brittle upkeep — REJECTED.** Rendering a graphical
  conversation means parsing `claude`'s stream-json event schema, which is
  **internal/undocumented** (CLAUDE.md: "the transcript format is internal to Claude Code",
  fail-soft required). Every `claude` release can silently break it — the treadmill
  VSCode-clone projects ride (Canopy runs `extension.js` unmodified to avoid it). Contradicts
  the user's low-maintenance goal.
- **Render layer only: LOW upkeep.** Markdown/code-highlight/image display are stable web
  standards; only npm dep bumps. Nothing coupled to the `claude` version.

**Decision:** build the **render layer + UX fixes**. Keep the terminal as the zero-upkeep
Claude conversation surface. The user's two annoyances are layout/UX, not chat-driver
problems, and are cheaply solved here.

---

## Part D — Chosen approach (execute this later)

### 1. Content-view pane kind (render layer)
1. Add `ContentTab` to the union — [src/shared/types.ts](../src/shared/types.ts) ~L92.
2. Add `case 'content':` branch — [DockHost.tsx](../src/renderer/components/dock/DockHost.tsx)
   ~L73 (the `never` check forces it). If the kind persists: bump `SCHEMA_VERSION` + add a
   migration (frozen zod snapshot) + a migration test, per persistence invariants.
3. Add `openContent(...)` store thunk mirroring `openPlan` —
   [src/renderer/store.ts](../src/renderer/store.ts) ~L208 (declare in the interface).
4. Build `ContentView` reusing PlanView's `react-markdown` stack + FileView's CodeMirror +
   `.plan-content` CSS + theme tokens. **Deliberately dock the input/controls so they never
   obscure the scrollback** (avoids VSCode's sticky-input flaw).
5. **Fix code coloring:** import an hljs theme CSS scoped to `.plan-content`, OR migrate the
   markdown code path to Shiki / `react-shiki` (LLM-grade streaming highlight).
6. **Attachments (display/preview):** component using HTML5 drag-drop (+ `dragover`
   preventDefault) + `onPaste` clipboard-image iteration + `dialog.showOpenDialog` via a NEW
   preload IPC verb — zod-validated + `pathGuard.isAllowedPath` containment, per IPC
   invariants. Preview strip w/ remove buttons.

### 2. UX papercut fixes (cheap — infra already wired)
- **One-click re-open plan:** add a button (pane header / EmptyTabView quick-action / cmdk
  palette entry) calling the existing `openPlan` thunk. PlanView + PlansView already render +
  list — this is UI glue only.
- Audit PlanView layout for the sticky/readability issue; apply the docked-input pattern.

### Explicitly OUT of scope (per upkeep decision)
Driving `claude` headless in stream-json for a graphical chat panel. Recorded as a possible
future Phase 2 only; NOT built. Terminal stays the Claude conversation UI.

---

## Part E — Verification (when built)
- `npm run typecheck` + `npm test` (add migration test if the kind persists).
- Drive app over CDP (per CLAUDE.md `window.__telchar`): open a content tab → markdown +
  colored code + image attachment render; use the re-open-plan button; split, layout-switch,
  quit/relaunch → tab restores, `Runtime.exceptionThrown` stays empty. Perf floor unchanged
  (15 terminals, `yes` flood in 3, GL contexts ≤ visible panes).

---

## Reference links
- Official docs: https://code.claude.com/docs/en/vs-code
- VSCode webview API: https://code.visualstudio.com/api/extension-guides/webview
- VSCode webview UX guidance: https://code.visualstudio.com/api/ux-guidelines/webviews
- Canopy (real extension.js in WKWebView): https://github.com/Saqoosha/Canopy
- claude-code-chat (OSS equivalent): https://github.com/andrepimenta/claude-code-chat
- openclaude-vscode (React+Tailwind webview): https://github.com/Harsh1210/openclaude-vscode
- Streamdown: https://streamdown.ai/ · https://github.com/vercel/streamdown
- react-markdown: https://github.com/remarkjs/react-markdown
- react-shiki: https://github.com/AVGVSTVS96/react-shiki · Shiki: https://shiki.style/packages/markdown-it
