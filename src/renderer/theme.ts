// Theme resolution: persisted pref ('dark' | 'light' | 'system') -> effective
// 'dark' | 'light'. 'system' rides Chromium's prefers-color-scheme, which in
// Electron follows nativeTheme (= macOS appearance) — no main-process wiring.

import { useEffect } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { ThemeMode } from '@shared/types'
import { useStore } from './store'
import { useRuntime } from './state/runtime'

// Full ANSI palettes: xterm ignores CSS vars, and its default bright
// yellow/white are unreadable on a light background.
export const XTERM_THEMES: Record<'dark' | 'light', ITheme> = {
  // Tokyo Night (night) terminal colors.
  dark: {
    background: '#1a1b26',
    foreground: '#c0caf5',
    // Ember cursor — the forge burning in every terminal (brand accent).
    cursor: '#ff9e64',
    cursorAccent: '#1a1b26',
    selectionBackground: '#283457',
    black: '#15161e',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#a9b1d6',
    brightBlack: '#414868',
    brightRed: '#f7768e',
    brightGreen: '#9ece6a',
    brightYellow: '#e0af68',
    brightBlue: '#7aa2f7',
    brightMagenta: '#bb9af7',
    brightCyan: '#7dcfff',
    brightWhite: '#c0caf5'
  },
  // Tokyo Night Day terminal colors.
  light: {
    background: '#e1e2e7',
    foreground: '#3760bf',
    // Day ember cursor (matches --color-ember light value).
    cursor: '#b15c00',
    cursorAccent: '#e1e2e7',
    selectionBackground: '#b7c1e3',
    black: '#e9e9ed',
    red: '#f52a65',
    green: '#587539',
    yellow: '#8c6c3e',
    blue: '#2e7de9',
    magenta: '#9854f1',
    cyan: '#007197',
    white: '#6172b0',
    brightBlack: '#a1a6c5',
    brightRed: '#f52a65',
    brightGreen: '#587539',
    brightYellow: '#8c6c3e',
    brightBlue: '#2e7de9',
    brightMagenta: '#9854f1',
    brightCyan: '#007197',
    brightWhite: '#3760bf'
  }
}

const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

export function resolveTheme(pref: ThemeMode): 'dark' | 'light' {
  if (pref === 'system') return mq().matches ? 'dark' : 'light'
  return pref
}

// Applies the effective theme to <html data-theme> (CSS tokens) and the
// runtime store (xterm/CodeMirror consumers). Call once at the top of App.
export function useThemeController(): void {
  const pref = useStore((s) => s.state.theme)

  useEffect(() => {
    const apply = () => {
      const effective = resolveTheme(pref)
      document.documentElement.dataset.theme = effective
      useRuntime.getState().setEffectiveTheme(effective)
    }
    apply()
    if (pref !== 'system') return
    const media = mq()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [pref])
}
