// Editable file viewer. Hosts the shared CodeEditor (edit + ⌘S save + ⌘Z undo)
// and owns the chrome: path, dirty/save state, and the read-only fallbacks
// (binary, or truncated >1 MB — editing a truncated buffer would clobber the
// rest of the file on save, so those stay read-only).

import { useEffect, useRef, useState } from 'react'
import { languages } from '@codemirror/language-data'
import type { LanguageSupport } from '@codemirror/language'
import type { FileTab } from '@shared/types'
import { useRuntime } from '../state/runtime'
import { CodeEditor, type EditorStatus } from './CodeEditor'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'binary'; note: string }
  | { kind: 'error'; note: string }
  | { kind: 'ok'; content: string; truncated: boolean; lang: LanguageSupport | null }

const dirOf = (p: string) => p.slice(0, p.lastIndexOf('/'))

export function FileView({ tab }: { tab: FileTab }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [status, setStatus] = useState<EditorStatus | null>(null)
  const effectiveTheme = useRuntime((s) => s.effectiveTheme)
  // Bumped to force a re-read after an external change to this file.
  const [reloadSeq, setReloadSeq] = useState(0)
  const pathRef = useRef(tab.path)
  pathRef.current = tab.path

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const res = await window.telchar.fs.readFile(tab.path)
        if (disposed) return
        if (res.binary) {
          setLoaded({ kind: 'binary', note: `${(res.size / 1024).toFixed(1)} KB binary file` })
          return
        }
        const ext = tab.path.split('.').pop() ?? ''
        const langDesc = languages.find(
          (l) => l.extensions.includes(ext) || l.filename?.test(tab.path.split('/').pop() ?? '')
        )
        const lang = langDesc ? await langDesc.load() : null
        if (disposed) return
        setLoaded({ kind: 'ok', content: res.content, truncated: res.truncated, lang })
      } catch (e) {
        if (!disposed) setLoaded({ kind: 'error', note: String(e) })
      }
    })()
    return () => {
      disposed = true
    }
  }, [tab.path, reloadSeq])

  // Re-read when the worktree watcher reports a change in this file's directory.
  // CodeEditor gates the actual buffer swap on the dirty flag (never clobbers).
  useEffect(() => {
    return window.telchar.fs.onChanged((msg) => {
      if (msg.dirs === null || msg.dirs.includes(dirOf(pathRef.current))) {
        setReloadSeq((n) => n + 1)
      }
    })
  }, [])

  const readOnly = loaded.kind === 'ok' && loaded.truncated

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1 text-[11px] text-dim">
        <span className="min-w-0 flex-1 truncate font-mono">{tab.path}</span>
        {loaded.kind === 'ok' && loaded.truncated && (
          <span className="shrink-0 text-amber-300/80">showing first 1 MB — read-only</span>
        )}
        {status?.stale && <span className="shrink-0 text-amber-300/80">changed on disk</span>}
        {status?.save === 'error' && (
          <span className="shrink-0 text-red-400" title={status.error}>
            save failed
          </span>
        )}
        {loaded.kind === 'ok' && !readOnly && status?.dirty && (
          <span className="shrink-0 text-amber-300" title="Unsaved — ⌘S to save">
            ● unsaved
          </span>
        )}
        {loaded.kind === 'ok' && !readOnly && !status?.dirty && status?.save === 'saved' && (
          <span className="shrink-0 text-green-400/80">saved</span>
        )}
        {readOnly && <span className="shrink-0 rounded bg-panel px-1.5 py-0.5">read-only</span>}
      </div>
      {loaded.kind === 'binary' || loaded.kind === 'error' ? (
        <div className="flex flex-1 items-center justify-center text-dim">
          {loaded.kind === 'binary' ? `Binary file — ${loaded.note}` : `Could not open: ${loaded.note}`}
        </div>
      ) : loaded.kind === 'ok' ? (
        <CodeEditor
          path={tab.path}
          initialDoc={loaded.content}
          language={loaded.lang}
          theme={effectiveTheme}
          readOnly={readOnly}
          onStatus={setStatus}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-dim">loading…</div>
      )}
    </div>
  )
}
