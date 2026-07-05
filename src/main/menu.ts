// Application menu. Shortcuts live here as accelerators so they override
// Electron defaults (notably Cmd+W = close window) and forward to the renderer.

import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IPC, type ShortcutAction } from '@shared/ipc'

export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const send = (action: ShortcutAction) => getWindow()?.webContents.send(IPC.shortcut, action)

  const focusPaneItems: MenuItemConstructorOptions[] = Array.from({ length: 9 }, (_, i) => ({
    label: `Focus Pane ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: () => send({ type: 'focus-pane', index: i + 1 })
  }))

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => send({ type: 'new-terminal' })
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => send({ type: 'close-tab' })
        },
        { type: 'separator' },
        {
          label: 'Quick Open…',
          accelerator: 'CmdOrCtrl+P',
          click: () => send({ type: 'quick-open' })
        },
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send({ type: 'command-palette' })
        }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => send({ type: 'toggle-sidebar' })
        },
        {
          label: 'Session Overview',
          accelerator: 'CmdOrCtrl+O',
          click: () => send({ type: 'toggle-overview' })
        },
        {
          label: 'Jump to Needs-Input',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => send({ type: 'jump-attention' })
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => send({ type: 'keybinds' })
        },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Shift+]',
          click: () => send({ type: 'next-tab' })
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Shift+[',
          click: () => send({ type: 'prev-tab' })
        },
        { type: 'separator' },
        ...focusPaneItems,
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' }
      ]
    },
    {
      label: 'Pane',
      submenu: [
        {
          label: 'Split Right',
          accelerator: 'CmdOrCtrl+\\',
          click: () => send({ type: 'split-right' })
        },
        {
          label: 'Split Down',
          accelerator: 'CmdOrCtrl+Alt+\\',
          click: () => send({ type: 'split-down' })
        },
        // Directional aliases. ⌘⌥+arrows are taken by layout switching and
        // plain ⌥+arrows must stay free for shell word-jump, hence Ctrl+Cmd.
        {
          label: 'Split Right (directional)',
          accelerator: 'Ctrl+Cmd+Right',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => send({ type: 'split-right' })
        },
        {
          label: 'Split Down (directional)',
          accelerator: 'Ctrl+Cmd+Down',
          visible: false,
          acceleratorWorksWhenHidden: true,
          click: () => send({ type: 'split-down' })
        },
        {
          label: 'Maximize Pane',
          accelerator: 'CmdOrCtrl+Shift+Enter',
          click: () => send({ type: 'maximize-pane' })
        }
      ]
    },
    {
      label: 'Layout',
      submenu: [
        {
          label: 'New Layout',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send({ type: 'new-layout' })
        },
        {
          label: 'Next Layout',
          accelerator: 'CmdOrCtrl+Alt+Right',
          click: () => send({ type: 'next-layout' })
        },
        {
          label: 'Previous Layout',
          accelerator: 'CmdOrCtrl+Alt+Left',
          click: () => send({ type: 'prev-layout' })
        }
      ]
    },
    { role: 'windowMenu' }
  ]

  // appMenu role only renders meaningfully on macOS; drop it elsewhere.
  if (process.platform !== 'darwin') template.shift()

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
