# Telchar

A VSCode-style shell hyper-optimized for driving many Claude Code sessions across many project folders — in one always-running window. Layout tabs hold dockable split-pane grids (each pane with its own tab strip), a left activity bar switches sidebar views (sessions / projects / plans / files / git / search) under a sticky project-scope selector, and a cross-layout attention system tells you instantly which claude session needs you. Layout survives restart; claude sessions auto-resume.

Built with Electron + React 19 + TypeScript, dockview, xterm.js + node-pty, Tailwind v4, CodeMirror 6, zustand. macOS (Apple Silicon) first.

## The name

**Telchar** was the greatest smith of the Dwarves in Tolkien's legendarium — he forged Narsil, the sword that cut the One Ring from Sauron's hand; Angrist, the knife that cut a Silmaril from Morgoth's crown; and the Dragon-helm of Dor-lómin, graven with runes of victory. Naming a tool for forging and driving many Claude Code sessions after a master-smith felt right.

_One forge. Many sessions._

Name lore, the cirth wordmark (TELCHAR in real Angerthas Daeron runes), colors, and voice live in [`BRAND.md`](BRAND.md).

## Prerequisites

- Node.js 22+
- macOS on Apple Silicon (arm64) for packaging; dev runs anywhere Electron does

## Install

```bash
npm install
```

`postinstall` runs `electron-builder install-app-deps`, which rebuilds the `node-pty` native module against Electron's ABI. If you switch Electron versions later, re-run it with `npm run rebuild`.

## Run (development)

```bash
npm run dev
```

This starts electron-vite with hot reload on renderer edits.

### Gotcha: `ELECTRON_RUN_AS_NODE`

If your shell exports `ELECTRON_RUN_AS_NODE=1`, Electron boots as plain Node and crashes on startup (`Cannot read properties of undefined (reading 'whenReady')`; the packaged app reports `bad option`). Unset it, or run without it:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

To fix permanently, remove the export from your `~/.zshrc` / `~/.zprofile` / `~/.zshenv`:

```bash
grep -rn ELECTRON_RUN_AS_NODE ~/.zshrc ~/.zprofile ~/.zshenv 2>/dev/null
```

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Dev server + Electron with hot reload                     |
| `npm run build`     | Compile main/preload/renderer to `out/` (headless)        |
| `npm run typecheck` | TypeScript check (main + renderer projects)               |
| `npm test`          | Unit tests (migrations, reducers, git parser, adapter)    |
| `npm run rebuild`   | Rebuild native deps (node-pty) against Electron           |
| `npm run package`   | Build and package an arm64 `.dmg` into `release/`         |

## Concepts

- **Layouts** (centered in the title bar) — named workspaces, each a full dockable pane grid. Group however you like: "proj 1+2", "proj 3+4", "deploys". Drag a tab onto a layout name (or use the palette) to move it across layouts. Empty layouts show quick actions, never a void.
- **Panes** — VSCode editor groups: each pane has its own tab strip; drag tabs to any edge to split. Tab kinds: terminal, read-only file viewer, live plan viewer, and **empty tabs** (the "+" on any pane strip) that hold a content picker until used. Double-click a tab to rename it (pins over claude's live titles).
- **Sidebar views** (activity bar): **Sessions** (all sessions grouped by project — the daily driver), **Projects** (folder management: add/remove/rename/recolor), **Plans** (global `~/.claude/plans`), **Files**, **Git**, **Search**. The keyboard icon at the bottom (or ⌘/) opens the shortcut reference.
- **Project scope** — the selector at the top of the sidebar is sticky across all views. "All projects" keeps the cross-project overview; picking one scopes Sessions/Git/Files/Search to it.
- **Attention** — per-terminal glyph: pulsing = busy, amber = needs input, red × = exited. Rolls up to pane strips, layout tabs, the status bar, and the macOS dock badge. Works cross-layout.
- **Overview (⌘O)** — every session from every layout as cards with live output tails; type to filter, Enter jumps (switching layout if needed). ⌘⇧A jumps straight to the oldest needs-input session.
- **Active context** — with scope on "All projects", the focused tab's project drives the Files view, status bar, and ⌘T target. Tabs are the project selector.
- **Auto-resume** — terminals that were running claude when the app quit re-run `claude --continue` on restore.
- **Claude hooks (optional, precise attention)** — run "Claude: Install Attention Hooks" from the command palette (⌘⇧P). Adds `Notification`/`Stop` hooks to `~/.claude/settings.json` (backed up first) that ping Telchar over localhost; inert outside Telchar terminals.

## Usage

- **⊕** next to the scope selector — new terminal in any project, or add a project folder. Dragging a folder from Finder onto the window also works.
- Sessions view — click a session to jump to it wherever it lives; layout badges show where.
- Git view — per-project changed files (VSCode colors), commit-all / pull / push; errors surface inline.
- Plans view — Claude Code plans from `~/.claude/plans`, newest first, live-updating markdown tabs.
- Double-click a project, layout, or tab name to rename; click a project's color dot to change its color.

### Keyboard shortcuts

| Shortcut              | Action                                          |
| --------------------- | ----------------------------------------------- |
| `⌘T`                  | New terminal in the active project              |
| `⌘\` / `⌘⌥\`          | Split pane right / down (same project + cwd)    |
| `⌘W`                  | Close the active tab                            |
| `⌘1` … `⌘9`           | Focus pane N in the active layout               |
| `⌘⇧]` / `⌘⇧[`         | Next / previous tab in the focused pane         |
| `⌘⇧Enter`             | Maximize / restore the focused pane             |
| `⌘O`                  | Session overview (all layouts)                  |
| `⌘⇧A`                 | Jump to the oldest needs-input session          |
| `⌘P` / `⌘⇧P`          | Quick-open (sessions + files) / command palette |
| `⌘B`                  | Toggle sidebar                                  |
| `⌘⇧N`                 | New layout                                      |
| `⌘⌥←` / `⌘⌥→`         | Previous / next layout                          |
| `⌘/`                  | Keyboard shortcut reference                     |

## Project structure

```
src/
  shared/     types.ts, ipc.ts        — shared contract (main + preload + renderer)
  main/       index.ts, ptyManager.ts, persistence.ts, migrations.ts, gitService.ts,
              fsService.ts, hookServer.ts, claudeHooks.ts, watcher.ts, env.ts,
              pathGuard.ts, ipc.ts, menu.ts
  preload/    index.ts                — verb-based contextBridge API
  renderer/   store.ts, state/        — persisted store (pure reducers) + runtime store
              components/dock/        — dockview adapter + host (the only dockview-aware code)
              components/sidebar/     — Sessions / Projects / Plans / Files / Git / Search views
              components/ui/          — vendored radix primitives (Tooltip, Menu)
              components/             — ActivityBar, TitleBar, StatusBar, Overview, Palette,
                                        KeybindsHelp, TerminalView, FileView, PlanView
tests/        migrations, reducers, git porcelain parser, dock adapter
```

Working on this codebase with Claude Code? **`CLAUDE.md`** holds the architecture invariants, gotchas (Electron/dockview/xterm/git), and the CDP-based verification workflow. Original design rationale lives in the plan files under `~/.claude/plans/` (`our-app-has-a-cuddly-yao.md` is the v2 overhaul).
