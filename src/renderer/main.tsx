import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useStore } from './store'
import { useRuntime } from './state/runtime'
import 'dockview-react/dist/styles/dockview.css'
import './styles.css'

// Dev-only debug handle (driven by CDP smoke tests; stripped from prod builds).
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__telchar = { store: useStore, runtime: useRuntime }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="app" onReset={() => location.reload()}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
