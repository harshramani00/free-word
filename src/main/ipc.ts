import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { IPC } from '../shared/ipc'
import type {
  CloseReason,
  DocumentState,
  ExportPdfRequest,
  OpenedDocument,
  PickedImage,
  SaveRequest,
  SaveResult,
  Theme
} from '../shared/types'
import type { CloudAccount, CloudRow, CloudState, VersionInfo } from '../shared/cloud'
import { cloud } from './cloud'
import { buildDocx } from './docx/build'
import { importDocx } from './docx/import'
import { log } from './log'
import { exportPdf } from './pdf'
import { addRecent, listRecent, removeRecent } from './recent'

export interface IpcHost {
  getWindow(): BrowserWindow | null
  onDocumentState(state: DocumentState): void
  onCloseConfirmed(reason: CloseReason): void
  onCloseCanceled(): void
}

const DOCX_FILTER = [{ name: 'Word Document', extensions: ['docx'] }]
const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]

export async function openDocumentFromPath(filePath: string): Promise<OpenedDocument> {
  const buffer = await fs.readFile(filePath)
  const { html, pageSetup, warnings } = await importDocx(buffer)
  await addRecent(filePath)
  const tracking = cloud().trackingFor(filePath)
  return { path: filePath, name: basename(filePath, extname(filePath)), html, pageSetup, warnings, cloudDocId: tracking?.docId ?? null, cloudNewer: tracking?.newer ?? null }
}

async function writeDocx(filePath: string, req: SaveRequest): Promise<SaveResult> {
  try {
    const buffer = await buildDocx(req.json, req.pageSetup)
    await fs.writeFile(filePath, buffer)
    await addRecent(filePath)
    // The file is safely on disk; the cloud copy follows in the background when the document is synced.
    if (req.path && req.path !== filePath) await cloud().noteLocalPath(req.path, filePath)
    cloud()
      .onLocalSave(filePath, buffer)
      .catch((err: unknown) => log('cloud upload after save failed', err))
    return { ok: true, path: filePath, name: basename(filePath, '.docx') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function saveAs(win: BrowserWindow | null, req: SaveRequest): Promise<SaveResult> {
  const defaultPath = req.path ?? join(app.getPath('documents'), `${req.suggestedName || 'Untitled'}.docx`)
  const opts = { title: 'Save', defaultPath, filters: DOCX_FILTER }
  const { filePath, canceled } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return { ok: false, canceled: true }
  const withExt = extname(filePath).toLowerCase() === '.docx' ? filePath : `${filePath}.docx`
  return writeDocx(withExt, req)
}

export function registerIpc(host: IpcHost): void {
  ipcMain.handle(IPC.themeGet, (): Theme => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'))

  ipcMain.handle(IPC.fileOpenDialog, async (): Promise<OpenedDocument | null> => {
    const win = host.getWindow()
    const opts = { title: 'Open', properties: ['openFile' as const], filters: DOCX_FILTER }
    const { filePaths, canceled } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (canceled || filePaths.length === 0) return null
    return openDocumentFromPath(filePaths[0])
  })

  ipcMain.handle(IPC.fileOpenPath, (_e, filePath: string) => openDocumentFromPath(filePath))

  ipcMain.handle(IPC.fileSave, async (_e, req: SaveRequest): Promise<SaveResult> => {
    if (!req.path) return saveAs(host.getWindow(), req)
    return writeDocx(req.path, req)
  })

  ipcMain.handle(IPC.fileSaveAs, (_e, req: SaveRequest) => saveAs(host.getWindow(), req))

  ipcMain.handle(IPC.fileExportPdf, async (_e, req: ExportPdfRequest): Promise<SaveResult> => {
    const win = host.getWindow()
    if (!win) return { ok: false, error: 'No window' }
    return exportPdf(win, req)
  })

  ipcMain.handle(IPC.filePickImage, async (): Promise<PickedImage | null> => {
    const win = host.getWindow()
    const opts = { title: 'Insert Image', properties: ['openFile' as const], filters: IMAGE_FILTER }
    const { filePaths, canceled } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (canceled || filePaths.length === 0) return null
    const filePath = filePaths[0]
    const data = await fs.readFile(filePath)
    const ext = extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    const size = nativeImage.createFromBuffer(data).getSize()
    return {
      dataUrl: `data:${mime};base64,${data.toString('base64')}`,
      name: basename(filePath),
      width: size.width,
      height: size.height
    }
  })

  ipcMain.on(IPC.fileReveal, (_e, filePath: string) => shell.showItemInFolder(filePath))

  ipcMain.handle(IPC.recentList, () => listRecent())
  ipcMain.handle(IPC.recentRemove, (_e, filePath: string) => removeRecent(filePath))

  ipcMain.on(IPC.windowDocumentState, (_e, state: DocumentState) => host.onDocumentState(state))
  ipcMain.on(IPC.windowCloseConfirmed, (_e, reason: CloseReason) => host.onCloseConfirmed(reason))
  ipcMain.on(IPC.windowCloseCanceled, () => host.onCloseCanceled())

  /* ---------- Cloud ---------- */
  ipcMain.handle(IPC.cloudState, (): CloudState => cloud().state())
  ipcMain.handle(IPC.cloudList, (): CloudRow[] => cloud().list())
  ipcMain.handle(IPC.cloudRefresh, () => cloud().refresh())
  ipcMain.handle(IPC.cloudSignIn, (_e, serverUrl: string): Promise<CloudAccount> => cloud().signIn(serverUrl))
  ipcMain.handle(IPC.cloudSignOut, () => cloud().signOut())
  ipcMain.handle(IPC.cloudSetEnabled, (_e, enabled: boolean) => cloud().setEnabled(enabled))
  ipcMain.handle(IPC.cloudChooseFolder, async (): Promise<string | null> => {
    const win = host.getWindow()
    const opts = {
      title: 'Choose your Quill folder',
      message: 'Documents you download from the cloud are saved here, and uploads come from here.',
      defaultPath: cloud().store.folder ?? join(app.getPath('documents'), 'Quill'),
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const { filePaths, canceled } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (canceled || filePaths.length === 0) return null
    await cloud().setFolder(filePaths[0])
    return filePaths[0]
  })
  ipcMain.handle(IPC.cloudDownload, async (_e, docId: string, version?: number): Promise<OpenedDocument> => openDocumentFromPath(await cloud().download(docId, version)))
  ipcMain.handle(IPC.cloudRemoveDownload, (_e, docId: string) => cloud().removeDownload(docId))
  ipcMain.handle(IPC.cloudStopSyncing, (_e, docId: string) => cloud().stopSyncing(docId))
  ipcMain.handle(IPC.cloudUpload, (_e, filePath: string): Promise<CloudRow> => cloud().uploadLocal(filePath))
  ipcMain.handle(IPC.cloudVersions, (_e, docId: string): Promise<VersionInfo[]> => cloud().versions(docId))
  ipcMain.handle(IPC.cloudRestore, async (_e, docId: string, version: number): Promise<OpenedDocument> => openDocumentFromPath(await cloud().restore(docId, version)))
  ipcMain.handle(IPC.cloudDisconnectApp, (_e, id: string) => cloud().disconnectApp(id))
}
