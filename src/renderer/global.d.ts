/// <reference types="vite/client" />

import type { TelcharApi } from '@shared/ipc'

declare global {
  interface Window {
    telchar: TelcharApi
  }
}

export {}
