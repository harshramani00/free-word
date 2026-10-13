import { app, BrowserWindow, Menu, nativeTheme } from 'electron'
import { IPC } from '../shared/ipc'
import type { CloseReason, DocumentState } from '../shared/types'
import { openDocumentFromPath, registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { createMainWindow } from './window'
import { installErrorLogging, log } from './log'

installErrorLogging()
log('main starting', { packaged: app.isPackaged, argv: process.argv.slice(1), version: app.getVersion(), electron: process.versions.electron })

let win: BrowserWindow | null = null
let docState: DocumentState = { title: 'Quill', path: null, dirty: false }
let forceClose = false
let quitting = false
let pendingOpenPath: string | null = null

function applyDocumentState(state: DocumentState): void {
  docState = state
  if (!win) return
  win.setTitle(state.dirty ? `${state.title} — Edited` : state.title)
  win.setDocumentEdited(state.dirty)
  win.setRepresentedFilename(state.path ?? '')
}

async function sendOpen(filePath: string): Promise<void> {
  if (!win) {
    pendingOpenPath = filePath
    return
  }
  try {
    const doc = await openDocumentFromPath(filePath)
    win.webContents.send(IPC.openDocument, doc)
  } catch (err) {
    log('open failed', filePath, err instanceof Error ? err : String(err))
    console.error('Failed to open', filePath, err)
  }
}

function createWindow(): void {
  win = createMainWindow()
  forceClose = false

  win.on('close', (event) => {
    if (forceClose || !docState.dirty) return
    event.preventDefault()
    win?.webContents.send(IPC.confirmClose, quitting ? ('quit' as CloseReason) : ('close' as CloseReason))
  })

  win.on('closed', () => {
    win = null
    docState = { title: 'Quill', path: null, dirty: false }
  })

  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) {
      const p = pendingOpenPath
      pendingOpenPath = null
      void sendOpen(p)
    }
  })
}

registerIpc({
  getWindow: () => win,
  onDocumentState: applyDocumentState,
  onCloseConfirmed: (reason) => {
    forceClose = true
    if (reason === 'quit') app.quit()
    else win?.close()
  },
  onCloseCanceled: () => {
    quitting = false
  }
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (app.isReady() && !win) createWindow()
  void sendOpen(filePath)
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

nativeTheme.on('updated', () => {
  win?.webContents.send(IPC.themeChanged, nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
})

void app.whenReady().then(() => {
  log('app ready')
  app.setName('Quill')
  Menu.setApplicationMenu(buildAppMenu())
  createWindow()
  const argPath = process.argv.slice(app.isPackaged ? 1 : 2).find((a) => a.toLowerCase().endsWith('.docx'))
  if (argPath) pendingOpenPath = argPath
})
