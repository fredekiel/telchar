// macOS GUI apps launched from Finder/Dock inherit launchd's minimal PATH,
// so `claude`/`node`(nvm)/`brew` are missing. Resolve the real login-shell env
// once at startup and reuse it for every pty spawn. Fall back to process.env
// if the shell probe hangs or fails.

// shell-env is pure ESM; import it dynamically from this CommonJS main bundle.
let cached: NodeJS.ProcessEnv | null = null

const FALLBACK_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':')

export async function resolveShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (cached) return cached
  let resolved: NodeJS.ProcessEnv
  try {
    // shell-env spawns the user's login shell (`$SHELL -ilc`) and parses env.
    const { shellEnv } = await import('shell-env')
    const env = await Promise.race([
      shellEnv(),
      new Promise<Record<string, string>>((_, reject) =>
        setTimeout(() => reject(new Error('shell-env timeout')), 5000)
      )
    ])
    resolved = { ...process.env, ...env }
  } catch {
    // Corrupt rc file or slow shell — don't hang startup.
    resolved = { ...process.env }
  }
  if (!resolved.PATH || resolved.PATH.trim() === '') {
    resolved.PATH = FALLBACK_PATH
  }
  cached = resolved
  return resolved
}

export function defaultShell(): string {
  return process.env.SHELL || '/bin/zsh'
}
