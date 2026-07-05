// Crash containment. Without a boundary a single render throw unwinds to the
// root and React unmounts the whole tree — every terminal white-screens.
// Used per-pane (TabBody) and once at the root (main.tsx).

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  // Where the crash happened, shown in the fallback ("pane", "app").
  label: string
  // Default recovery re-renders the children; the root boundary reloads the
  // window instead (a root crash rarely survives a plain re-render).
  onReset?: () => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error(`[telchar] ${this.props.label} crashed:`, error)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg p-6">
        <div className="font-semibold text-fg">This {this.props.label} crashed</div>
        <div className="max-w-lg overflow-x-auto text-center text-sm text-dim">
          {this.state.error.message}
        </div>
        <button
          onClick={() => (this.props.onReset ? this.props.onReset() : this.setState({ error: null }))}
          className="cursor-pointer rounded-md bg-accent px-4 py-1.5 font-semibold text-bg hover:bg-accent/85"
        >
          Reload {this.props.label}
        </button>
      </div>
    )
  }
}
