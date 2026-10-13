import { app, BrowserWindow, Menu, shell } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { IPC } from '../shared/ipc'
import type { MenuAction } from '../shared/types'

type Send = (action: MenuAction) => void

function sendToFocused(action: MenuAction): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(IPC.menuAction, action)
}

function item(label: string, action: MenuAction, accelerator?: string, send: Send = sendToFocused): MenuItemConstructorOptions {
  return { label, accelerator, click: () => send(action) }
}

export function buildAppMenu(): Menu {
  const isMac = process.platform === 'darwin'

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      item('New', 'file:new', 'CmdOrCtrl+N'),
      item('Open…', 'file:open', 'CmdOrCtrl+O'),
      { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
      { type: 'separator' },
      item('Close', 'file:close', 'CmdOrCtrl+W'),
      item('Save', 'file:save', 'CmdOrCtrl+S'),
      item('Save As…', 'file:saveAs', 'Shift+CmdOrCtrl+S'),
      { type: 'separator' },
      item('Export…', 'file:export', 'Shift+CmdOrCtrl+E'),
      item('Export as PDF…', 'file:exportPdf', 'CmdOrCtrl+P')
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      item('Undo', 'edit:undo', 'CmdOrCtrl+Z'),
      item('Redo', 'edit:redo', 'Shift+CmdOrCtrl+Z'),
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      item('Add Link…', 'edit:link', 'CmdOrCtrl+K')
    ]
  }

  const formatMenu: MenuItemConstructorOptions = {
    label: 'Format',
    submenu: [
      {
        label: 'Paragraph Style',
        submenu: [
          item('Body', 'style:body', 'Alt+CmdOrCtrl+0'),
          item('Title', 'style:title'),
          item('Heading 1', 'style:h1', 'Alt+CmdOrCtrl+1'),
          item('Heading 2', 'style:h2', 'Alt+CmdOrCtrl+2'),
          item('Heading 3', 'style:h3', 'Alt+CmdOrCtrl+3'),
          item('Quote', 'style:quote')
        ]
      },
      { type: 'separator' },
      item('Bold', 'format:bold', 'CmdOrCtrl+B'),
      item('Italic', 'format:italic', 'CmdOrCtrl+I'),
      item('Underline', 'format:underline', 'CmdOrCtrl+U'),
      item('Strikethrough', 'format:strike'),
      { type: 'separator' },
      {
        label: 'Alignment',
        submenu: [
          item('Align Left', 'format:alignLeft', 'Shift+CmdOrCtrl+L'),
          item('Center', 'format:alignCenter', 'Shift+CmdOrCtrl+C'),
          item('Align Right', 'format:alignRight', 'Shift+CmdOrCtrl+R'),
          item('Justify', 'format:alignJustify', 'Shift+CmdOrCtrl+J')
        ]
      },
      {
        label: 'Lists',
        submenu: [
          item('Bulleted List', 'format:bulletList', 'Shift+CmdOrCtrl+8'),
          item('Numbered List', 'format:orderedList', 'Shift+CmdOrCtrl+7')
        ]
      },
      item('Increase Indent', 'format:indent', 'CmdOrCtrl+]'),
      item('Decrease Indent', 'format:outdent', 'CmdOrCtrl+[')
    ]
  }

  const insertMenu: MenuItemConstructorOptions = {
    label: 'Insert',
    submenu: [
      item('Table…', 'insert:table'),
      item('Image…', 'insert:image'),
      item('Horizontal Rule', 'insert:hr'),
      item('Page Break', 'insert:pageBreak', 'CmdOrCtrl+Return')
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      item('Zoom In', 'view:zoomIn', 'CmdOrCtrl+='),
      { ...item('Zoom In', 'view:zoomIn', 'CmdOrCtrl+Plus'), visible: false },
      item('Zoom Out', 'view:zoomOut', 'CmdOrCtrl+-'),
      item('Actual Size', 'view:zoomReset', 'CmdOrCtrl+0'),
      { type: 'separator' },
      item('Toggle Navigation Pane', 'view:toggleNav', 'Alt+CmdOrCtrl+N'),
      item('Toggle Ruler', 'view:toggleRuler', 'Alt+CmdOrCtrl+R'),
      { type: 'separator' },
      item('Simple Toolbar', 'view:toolbarSimple'),
      item('Full Toolbar', 'view:toolbarFull'),
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(process.env['ELECTRON_RENDERER_URL'] ? [{ type: 'separator' } as MenuItemConstructorOptions, { role: 'toggleDevTools' } as MenuItemConstructorOptions] : [])
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    role: 'window',
    submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
  }

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      {
        label: 'Quill on GitHub',
        click: () => void shell.openExternal('https://github.com/harshramani00/quill')
      }
    ]
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    formatMenu,
    insertMenu,
    viewMenu,
    windowMenu,
    helpMenu
  ]
  return Menu.buildFromTemplate(template)
}
