// Editable CodeMirror 6 surface shared by FileView and the Markdown edit/split
// modes. Owns editing, undo history (⌘Z / ⌘⇧Z), ⌘S save-back, and dirty / stale
// tracking; the host component renders the chrome (path, dirty dot, errors) from
// the EditorStatus callback. The view is created once per (path, theme, language,
// readOnly); external content updates arrive via the `initialDoc` prop and are
// applied as a transaction so cursor + undo survive — and only when the buffer
// isn't dirty (never clobber unsaved edits; flag `stale` instead).

import { useEffect, useRef } from 'react'
import { EditorView, lineNumbers, highlightSpecialChars, keymap } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { defaultHighlightStyle, syntaxHighlighting, type LanguageSupport } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'

export interface EditorStatus {
  dirty: boolean
  stale: boolean // file changed on disk while the buffer had unsaved edits
  save: 'idle' | 'saving' | 'saved' | 'error'
  error?: string
}

const darkTweaks = EditorView.theme(
  {
    '&': { backgroundColor: '#1a1b26', height: '100%' },
    '.cm-gutters': { backgroundColor: '#16161e', border: 'none' },
    '.cm-content': { fontFamily: 'Menlo, "SF Mono", monospace', fontSize: '12.5px' }
  },
  { dark: true }
)

// Light mode keeps CodeMirror's defaultHighlightStyle (it IS the light style);
// only chrome colors need Tokyo Night Day values.
const lightTweaks = EditorView.theme(
  {
    '&': { backgroundColor: '#e1e2e7', height: '100%' },
    '.cm-gutters': { backgroundColor: '#d5d6db', color: '#848cb5', border: 'none' },
    '.cm-content': { fontFamily: 'Menlo, "SF Mono", monospace', fontSize: '12.5px' }
  },
  { dark: false }
)

export function CodeEditor({
  path,
  initialDoc,
  language,
  theme,
  readOnly = false,
  onStatus,
  onDocChange,
  className
}: {
  path: string
  initialDoc: string
  language: LanguageSupport | null
  theme: 'dark' | 'light'
  readOnly?: boolean
  onStatus?: (s: EditorStatus) => void
  onDocChange?: (doc: string) => void
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // Latest on-disk content the buffer is reconciled against. Updated on save and
  // on a clean external reload.
  const savedDocRef = useRef(initialDoc)
  const dirtyRef = useRef(false)
  const staleRef = useRef(false)
  // Read via refs inside CodeMirror callbacks so the view need not be recreated
  // when these change.
  const pathRef = useRef(path)
  const readOnlyRef = useRef(readOnly)
  const onStatusRef = useRef(onStatus)
  const onDocChangeRef = useRef(onDocChange)
  pathRef.current = path
  readOnlyRef.current = readOnly
  onStatusRef.current = onStatus
  onDocChangeRef.current = onDocChange
  const initialDocRef = useRef(initialDoc)
  initialDocRef.current = initialDoc

  const emit = (patch: Partial<EditorStatus>) => {
    onStatusRef.current?.({
      dirty: dirtyRef.current,
      stale: staleRef.current,
      save: 'idle',
      ...patch
    })
  }

  const save = (): boolean => {
    const view = viewRef.current
    if (!view || readOnlyRef.current) return true
    const doc = view.state.doc.toString()
    emit({ save: 'saving' })
    void window.telchar.fs.writeFile(pathRef.current, doc).then((res) => {
      if (res.ok) {
        savedDocRef.current = doc
        dirtyRef.current = false
        staleRef.current = false
        emit({ save: 'saved' })
      } else {
        emit({ save: 'error', error: res.error })
      }
    })
    return true
  }

  // Create (and recreate) the view. initialDoc is read via ref so typing / prop
  // churn doesn't rebuild the editor — only path/theme/language/readOnly do.
  useEffect(() => {
    if (!hostRef.current) return
    savedDocRef.current = initialDocRef.current
    dirtyRef.current = false
    staleRef.current = false

    const updateListener = EditorView.updateListener.of((u) => {
      if (!u.docChanged) return
      const cur = u.state.doc.toString()
      onDocChangeRef.current?.(cur)
      const d = cur !== savedDocRef.current
      if (d !== dirtyRef.current) {
        dirtyRef.current = d
        emit({ save: 'idle' })
      }
    })

    const extensions: Extension[] = [
      lineNumbers(),
      highlightSpecialChars(),
      history(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([{ key: 'Mod-s', run: save, preventDefault: true }, indentWithTab, ...defaultKeymap, ...historyKeymap]),
      theme === 'dark' ? [oneDark, darkTweaks] : [lightTweaks],
      EditorView.lineWrapping,
      updateListener,
      ...(language ? [language] : []),
      ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [])
    ]

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: initialDocRef.current, extensions })
    })
    viewRef.current = view
    emit({ save: 'idle' })
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, theme, language, readOnly])

  // External content arrived (host re-read the file). Apply only when the buffer
  // is clean; otherwise flag stale and keep the user's unsaved edits.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (initialDoc === savedDocRef.current) return // no real change (e.g. our own save echo)
    if (dirtyRef.current) {
      if (!staleRef.current) {
        staleRef.current = true
        emit({ save: 'idle' })
      }
      return
    }
    savedDocRef.current = initialDoc
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: initialDoc } })
    // dispatch fires updateListener → dirty recomputed as false (cur === saved)
  }, [initialDoc])

  return <div ref={hostRef} className={className ?? 'min-h-0 flex-1 overflow-hidden'} />
}
