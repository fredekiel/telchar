// Allow-list of roots the renderer may watch/read. Seeded from persisted +
// picked projects, plus the Claude plans dir. Every fs-touching IPC handler
// containment-checks through here (realpath defeats traversal/symlink escape).

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { basename, dirname, join, resolve, sep } from 'path'

const allowedRoots = new Set<string>([
  resolve(homedir(), '.claude', 'plans'),
  // Claude Code session transcripts — read-only source for the terminal
  // footer's session info (plan link, token count).
  resolve(homedir(), '.claude', 'projects')
])

export function addRoot(path: string): void {
  allowedRoots.add(resolve(path))
}

export function rootCount(): number {
  return allowedRoots.size
}

function containedIn(real: string): boolean {
  for (const root of allowedRoots) {
    if (real === root || real.startsWith(root + sep)) return true
  }
  return false
}

export async function isAllowedPath(path: string): Promise<boolean> {
  try {
    return containedIn(await fs.realpath(resolve(path)))
  } catch {
    return false
  }
}

// Containment check for a path that does NOT exist yet (create / rename dest).
// isAllowedPath can't be used — its realpath throws on a missing target. We
// validate the basename against traversal, realpath the PARENT (resolving any
// symlinked parent before the check), then confirm the rebuilt candidate stays
// contained.
export async function isAllowedNewPath(path: string): Promise<boolean> {
  try {
    const abs = resolve(path)
    const name = basename(abs)
    if (!name || name === '.' || name === '..' || name.includes(sep) || name.includes('/')) return false
    const realParent = await fs.realpath(dirname(abs))
    if (!containedIn(realParent)) return false
    return containedIn(join(realParent, name))
  } catch {
    return false
  }
}
