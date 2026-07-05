# Telchar

One always-on window for running many Claude Code sessions across many project folders. Layout tabs hold dockable split-pane grids of terminals; a cross-layout attention system tells you at a glance which session needs you. Layouts survive restart and Claude sessions auto-resume.

Electron · React 19 · TypeScript. **macOS (Apple Silicon) only.**

![macOS arm64](https://img.shields.io/badge/macOS-Apple%20Silicon-black) ![license MIT](https://img.shields.io/badge/license-MIT-blue)

## Install

Grab the latest `.dmg` from [**Releases**](https://github.com/fredekiel/telchar/releases/latest) and drag Telchar to Applications.

The build isn't Apple-notarized, so the first launch shows *"Telchar is damaged."* It isn't — that's just Gatekeeper on unsigned apps. Clear the flag once:

```bash
xattr -cr /Applications/Telchar.app
```

Then open it normally. (Or build from source below — a local build has no such flag.)

## Use

- **⊕** by the sidebar's project selector — new terminal, or add a project folder (dragging a folder from Finder works too).
- Left activity bar switches sidebar views: Sessions, Projects, Plans, Files, Git, Search — all scoped to the selected project.
- Drag any tab to a pane edge to split; drag it onto a layout name to move it across layouts.
- A session needs input? Amber glyph on the tab, rolled up to the pane, layout tab, status bar, and dock badge.

Handy keys:

| Key | Action |
| --- | --- |
| `⌘T` | New terminal in the active project |
| `⌘O` | Overview — every session, every layout |
| `⌘⇧A` | Jump to the oldest session needing input |
| `⌘\` | Split pane |
| `⌘⇧P` | Command palette · `⌘/` all shortcuts |

**Optional — precise attention:** run *Claude: Install Attention Hooks* from the palette (⌘⇧P). Adds `Notification`/`Stop` hooks to `~/.claude/settings.json` (backed up first) so Telchar knows the instant a session stops or needs input. Inert outside Telchar terminals.

## Build from source

Needs Node 22+ and macOS on Apple Silicon.

```bash
npm install          # rebuilds node-pty against Electron's ABI
npm run dev          # dev with hot reload
npm run package      # arm64 .dmg + .zip into release/
```

If your shell exports `ELECTRON_RUN_AS_NODE=1`, Electron boots as plain Node and crashes — prefix commands with `env -u ELECTRON_RUN_AS_NODE`.

## More

The name honors [Telchar](BRAND.md), the greatest Dwarven smith in Tolkien's legendarium. Architecture, invariants, and the contributor workflow live in [`CLAUDE.md`](CLAUDE.md).
