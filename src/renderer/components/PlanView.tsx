import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { markdown } from '@codemirror/lang-markdown'
import type { PlanTab } from '@shared/types'
import { useRuntime } from '../state/runtime'
import { CodeEditor, type EditorStatus } from './CodeEditor'

// markdown() is created once — a fresh LanguageSupport each render would force
// CodeEditor to rebuild its view on every keystroke.
const MD = markdown()

type Mode = 'preview' | 'edit' | 'split'

// Live markdown viewer with Preview / Edit / Split modes. Preview renders the
// watched (on-disk) content and live-tails; Edit/Split host the shared CodeEditor
// on the raw source (⌘S writes back). Split renders its preview from the editor's
// live buffer so unsaved edits show immediately.
export function PlanView({ tab }: { tab: PlanTab }) {
  const [content, setContent] = useState('')
  const [live, setLive] = useState('') // editor buffer, drives the split preview
  const [mode, setMode] = useState<Mode>('preview')
  const [tail, setTail] = useState(true)
  const [status, setStatus] = useState<EditorStatus | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const effectiveTheme = useRuntime((s) => s.effectiveTheme)

  useEffect(() => {
    let active = true
    void window.telchar.markdown.watch(tab.path).then((c) => active && setContent(c))
    const off = window.telchar.markdown.onChanged((msg) => {
      if (msg.path === tab.path) setContent(msg.content)
    })
    return () => {
      active = false
      off()
      window.telchar.markdown.unwatch(tab.path)
    }
  }, [tab.path])

  // Reset the split-preview buffer whenever the on-disk content changes; typing
  // then overrides it via onDocChange.
  useEffect(() => setLive(content), [content])

  const previewDoc = mode === 'split' ? live : content
  useEffect(() => {
    if (tail && mode !== 'edit' && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [previewDoc, tail, mode])

  const editor = (
    <CodeEditor
      path={tab.path}
      initialDoc={content}
      language={MD}
      theme={effectiveTheme}
      onStatus={setStatus}
      onDocChange={setLive}
    />
  )
  const preview = (
    <div className="plan-content min-h-0 flex-1 overflow-y-auto px-6 py-4" ref={scrollRef}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {previewDoc}
      </Markdown>
    </div>
  )

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-dim">
        <div className="flex overflow-hidden rounded border border-border">
          {(['preview', 'edit', 'split'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`cursor-pointer px-2 py-0.5 text-[11px] capitalize ${
                mode === m ? 'bg-accent text-bg' : 'hover:bg-panel hover:text-fg'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {mode !== 'edit' && (
          <label className="flex items-center gap-1.5 text-[11px]">
            <input type="checkbox" checked={tail} onChange={(e) => setTail(e.target.checked)} /> Tail
          </label>
        )}
        <span className="flex-1" />
        {status?.stale && <span className="text-[11px] text-amber-300/80">changed on disk</span>}
        {status?.save === 'error' && (
          <span className="text-[11px] text-red-400" title={status.error}>
            save failed
          </span>
        )}
        {mode !== 'preview' && status?.dirty && (
          <span className="text-[11px] text-amber-300" title="Unsaved — ⌘S to save">
            ● unsaved
          </span>
        )}
        {mode !== 'preview' && !status?.dirty && status?.save === 'saved' && (
          <span className="text-[11px] text-green-400/80">saved</span>
        )}
      </div>
      {/* Editor keeps the same tree slot in edit & split so toggling between them
          doesn't remount it (which would drop unsaved edits). */}
      {mode === 'preview' ? (
        preview
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{editor}</div>
          {mode === 'split' && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border">{preview}</div>
          )}
        </div>
      )}
    </div>
  )
}
