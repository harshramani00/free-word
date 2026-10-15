import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '../../shared/ipc'
import type { CloudRow, CloudState } from '../../shared/cloud'
import { log } from '../log'
import { CloudStore } from './store'
import { CloudSync } from './sync'

let sync: CloudSync | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
}

/** Creates the singleton sync engine; call once after app ready. */
export function startCloud(): CloudSync {
  if (sync) return sync
  sync = new CloudSync(new CloudStore(), {
    openExternal: (url) => {
      // In development the sign-in URL is also logged so the flow can be driven without a browser.
      if (!app.isPackaged) log('cloud sign-in url', url)
      return shell.openExternal(url)
    },
    trash: (path) => shell.trashItem(path),
    onState: (state: CloudState) => broadcast(IPC.cloudStateChanged, state),
    onRows: (rows: CloudRow[]) => broadcast(IPC.cloudListChanged, rows)
  })
  void sync.start()
  return sync
}

export function cloud(): CloudSync {
  if (!sync) throw new Error('Cloud not started')
  return sync
}
