# CLAUDE.md

Telchar: Electron + React 19 + TS desktop app — a VSCode-style shell for running many Claude Code terminal sessions across multiple project folders in one window. Layout tabs → dockable pane grids → per-pane tab strips; cross-layout attention system; git/files/plans sidebar views.

## Commands

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev   # dev (the env var may be set in this shell — Electron boots as Node and crashes without unsetting it)
npm run typecheck                          # tsc for main+preload (tsconfig.node) and renderer (tsconfig.web)
npm test                                   # vitest: tests/ (migrations, reducers, git parser, dock adapter)
npm run package                            # arm64 dmg into release/
```

Dev/packaged smoke via CDP (no assistive-access needed):
`env -u ELECTRON_RUN_AS_NODE npx electron-vite dev -- --remote-debugging-port=9222`, then WebSocket to `http://127.0.0.1:9222/json` → `Runtime.evaluate` / `Page.captureScreenshot`. The renderer exposes `window.__telchar = { store, runtime }` (dev builds only) for driving E2E. Boot health: 4 Electron procs + no exceptions. `Page.captureScreenshot` hangs forever (no response, not an error) while the window is occluded/minimized on macOS — nothing composites frames; `Page.bringToFront` and `fromSurface:false` don't help. Fall back to DOM/state assertions via `Runtime.evaluate`.

## Architecture invariants (do not break)

- **Renderer owns persisted layout; main owns runtime.** `tabId` is the ONLY main↔renderer contract. PIDs never persist.
- **Tabs map is the authority; dock grids are projections.** `PersistedState.tabs: Record<tabId, PersistedTab>`; each layout's grid is an opaque `DockGridEnvelope { lib, libVersion, grid: unknown }`. `grid` is NEVER zod-validated; `src/renderer/components/dock/adapter.ts` (+ DockHost) is the only dockview-aware code. Incompatible/corrupt envelope → rebuild default grid from the tabs map; geometry may be lost, tabs never.
- **All node-pty behind `src/main/ptyManager.ts`.** Streaming: 16ms/32KB coalesced flushes, 512KB ring buffer (the snapshot/rehydrate source — NOT @xterm/addon-serialize, which stays unused), pause/resume backpressure at 4MB.
- **Pure reducers** in `src/renderer/state/reducers.ts` — no electron, no dockview, unit-testable. Runtime-only state (attention, git status, tab→layout index) lives in `src/renderer/state/runtime.ts`, a separate zustand store that must never enter `state:save`.
- **Verb-based IPC only** (`src/shared/ipc.ts`), no generic invoke passthrough. Zod validation + `pathGuard.isAllowedPath` containment on every fs-touching handler in `src/main/ipc.ts`. Hot pty paths use cheap typeof checks by design.
- **Persistence** (`src/main/persistence.ts`): validate-before-write, atomic tmp+fsync+rename. Load = parse → `migrations.ts` (versioned, each migration keeps a FROZEN zod snapshot of its source schema) → validate → on failure back up (`workspace.json.bak-<ts>`, pruned to newest 5), never silently reset — `loadState` returns a `notice` the renderer shows as a dismissible banner. Schema change ⇒ bump `SCHEMA_VERSION`, add migration + test. Debounced saves flush on `beforeunload` via blocking `state:saveSync` (store.ts flushes pending dock envelopes first); main re-flushes its last good state in `before-quit`/`uncaughtException`.
- **Crash containment:** every pane body is wrapped in `ErrorBoundary` (per-pane + root in main.tsx) — a render throw kills one pane, never the window. Main auto-reloads the renderer on `render-process-gone` (max 3/min; PTYs live in main so reload reattaches with scrollback) and holds the single-instance lock (two instances would race on workspace.json).
- **Auto-resume security shape:** `CLAUDE_RESUME_COMMAND` is a renderer constant. Persisted data may only ever toggle the boolean gating it (`wasRunningClaude`); never persist command strings, never execute them in main.

## UX rules (user-decided; don't regress)

- **Selected-project rule:** the app always has exactly one selected project (searchable combobox atop the sidebar, persisted as `sidebar.selectedProjectId`, changed manually only — no auto-follow of the focused tab). It drives ALL sidebar views, status bar, ⌘T target. Exceptions: Projects view lists all projects (management), Plans is global, splits inherit the split pane's project, Overview/Palette/attention span everything. Zero projects → full-window takeover with a single "Add project folder" button.
- **Attention is cross-layout:** needs-input must be reachable without hunting — tab glyph → pane badge → layout-tab badge → status bar → dock badge; ⌘O overview and ⌘⇧A jump span ALL layouts. Priority: needs-input > busy; cleared by focusing/typing.
- Sidebar views are single-purpose: Sessions (daily driver) / Projects (folder mgmt only) / Plans (global `~/.claude/plans`) / Files / Git / Search.
- Empty states always offer actions (zero-project takeover, empty layout overlay, `empty` tab kind via per-pane "+").
- Terminal tab titles: live OSC title unless user renamed (`titlePinned`).

## Gotchas (each cost real debugging time)

- `ELECTRON_RUN_AS_NODE=1` in the user's shell breaks dev AND packaged launches (`bad option:` on flags). Always `env -u ELECTRON_RUN_AS_NODE`.
- Main and preload bundles must be CJS (no `"type": "module"`; preload rollup output forced cjs in electron.vite.config.ts). `shell-env` is pure ESM — dynamic `await import()` only.
- **dockview v7:** React binding is the `dockview-react` package (`dockview` itself has no `DockviewReact`). CSS: `dockview-react/dist/styles/dockview.css`. `maximizeGroup(panel)` takes a panel; `onDidActivePanelChange` yields `{ panel, origin }`. Group size constraints are NOT serialized — re-apply after `fromJSON`.
- **xterm in `renderer:'always'` panels:** never `term.open()` on a hidden/0-size host ("Cannot read properties of undefined (reading 'dimensions')" rAF loop). TerminalView defers open until the host has pixels and defers `term.dispose()` one macrotask. Keep WebGL visible-only (~16 context browser cap; xterm has no shared-context support) with `onContextLoss` → dispose → DOM fallback.
- **git status spawns need `GIT_OPTIONAL_LOCKS=0`** or refreshing `.git/index` re-triggers our own chokidar watcher (feedback loop), and `GIT_TERMINAL_PROMPT=0` or pulls hang on credential prompts. Watch `.git` METADATA only (HEAD/index/refs/packed-refs/MERGE_HEAD) for ALL projects; staleness is compensated on window focus / after actions / on git/files-view open. Exception: while the Files view is open, `worktreeWatcher.ts` runs ONE recursive `fs.watch` (FSEvents, no tree scan) on the selected project only — feeds tree refetch + git refresh; never widen this to all projects (10-project cost cliff).
- Every main-process spawn (git, ls-files, pty) must use `resolveShellEnv()` — packaged apps get macOS's minimal GUI PATH otherwise.
- node-pty must stay in `asarUnpack` (electron-builder.yml); `postinstall` rebuilds it against Electron's ABI.
- Claude Code hooks integration: PTYs get `TELCHAR_HOOK_PORT/TELCHAR_TAB_ID/TELCHAR_HOOK_TOKEN`; `hookServer.ts` (loopback + token) receives Notification/Stop/SessionStart events; installer (`claudeHooks.ts`) is opt-in, idempotent by marker comment, backs up `~/.claude/settings.json`. SessionStart is lifecycle-only — it must NEVER raise attention/notifications (App.tsx early-returns); its payload feeds the per-tab session mapping. `claudeSession.ts` resolves plan + context tokens from the session transcript with two narrow fail-soft scans (`"planFilePath"` — verified unique per session — and last assistant `usage`); the transcript format is internal to Claude Code, so both must degrade to undefined, never throw.

## Conventions

- Tailwind v4 CSS-first: tokens in `styles.css` `@theme` (`bg-bg`, `bg-bgalt`, `bg-panel`, `bg-panelhi`, `border-border`, `text-fg`, `text-dim`, `accent`) — Tokyo Night. Dockview themed via `--dv-*` overrides under `.telchar-dock`.
- Icons: lucide-react. Overlay primitives: vendored radix wrappers in `components/ui/` (Tooltip, Menu) — extend there, don't inline radix elsewhere.
- Git decoration colors mirror VSCode's git extension defaults (`src/renderer/gitColors.ts`); don't invent new ones.
- Menu accelerators (single-stroke only) live in `src/main/menu.ts` → `ShortcutAction` union → App.tsx dispatcher. New shortcut = all three places + KeybindsHelp.tsx.

## Verifying changes

Typecheck + vitest first. For anything touching dock/terminals/persistence, run the app and drive it over CDP (pattern above): split, layout switch, quit/relaunch (grids + scrollback restore, claude terminals get `claude --continue`), check `Runtime.exceptionThrown` stays empty. Perf floor: 15 terminals, `yes` flood in 3, UI responsive, GL contexts ≤ visible panes.
