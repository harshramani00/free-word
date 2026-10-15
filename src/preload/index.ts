import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CloudRow, CloudState } from '../shared/cloud'
import type {
  CloseReason,
  DocumentState,
  ExportPdfRequest,
  MenuAction,
  OpenedDocument,
  QuillApi,
  SaveRequest,
  Theme
} from '../shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: QuillApi = {
  platform: process.platform,

  getTheme: () => ipcRenderer.invoke(IPC.themeGet),
  onTheme: (cb) => subscribe<Theme>(IPC.themeChanged, cb),

  onMenu: (cb) => subscribe<MenuAction>(IPC.menuAction, cb),
  onOpenDocument: (cb) => subscribe<OpenedDocument>(IPC.openDocument, cb),
  onConfirmClose: (cb) => subscribe<CloseReason>(IPC.confirmClose, cb),
  closeConfirmed: (reason) => ipcRenderer.send(IPC.windowCloseConfirmed, reason),
  closeCanceled: () => ipcRenderer.send(IPC.windowCloseCanceled),

  openDialog: () => ipcRenderer.invoke(IPC.fileOpenDialog),
  openPath: (path) => ipcRenderer.invoke(IPC.fileOpenPath, path),
  save: (req: SaveRequest) => ipcRenderer.invoke(IPC.fileSave, req),
  saveAs: (req: SaveRequest) => ipcRenderer.invoke(IPC.fileSaveAs, req),
  exportPdf: (req: ExportPdfRequest) => ipcRenderer.invoke(IPC.fileExportPdf, req),
  pickImage: () => ipcRenderer.invoke(IPC.filePickImage),
  revealPath: (path) => ipcRenderer.send(IPC.fileReveal, path),

  recentList: () => ipcRenderer.invoke(IPC.recentList),
  recentRemove: (path) => ipcRenderer.invoke(IPC.recentRemove, path),

  setDocumentState: (state: DocumentState) => ipcRenderer.send(IPC.windowDocumentState, state),

  cloudState: () => ipcRenderer.invoke(IPC.cloudState),
  onCloudState: (cb) => subscribe<CloudState>(IPC.cloudStateChanged, cb),
  cloudList: () => ipcRenderer.invoke(IPC.cloudList),
  onCloudList: (cb) => subscribe<CloudRow[]>(IPC.cloudListChanged, cb),
  cloudRefresh: () => ipcRenderer.invoke(IPC.cloudRefresh),
  cloudSignIn: (serverUrl) => ipcRenderer.invoke(IPC.cloudSignIn, serverUrl),
  cloudSignOut: () => ipcRenderer.invoke(IPC.cloudSignOut),
  cloudSetEnabled: (enabled) => ipcRenderer.invoke(IPC.cloudSetEnabled, enabled),
  cloudChooseFolder: () => ipcRenderer.invoke(IPC.cloudChooseFolder),
  cloudDownload: (docId, version) => ipcRenderer.invoke(IPC.cloudDownload, docId, version),
  cloudRemoveDownload: (docId) => ipcRenderer.invoke(IPC.cloudRemoveDownload, docId),
  cloudStopSyncing: (docId) => ipcRenderer.invoke(IPC.cloudStopSyncing, docId),
  cloudUpload: (path) => ipcRenderer.invoke(IPC.cloudUpload, path),
  cloudVersions: (docId) => ipcRenderer.invoke(IPC.cloudVersions, docId),
  cloudRestore: (docId, version) => ipcRenderer.invoke(IPC.cloudRestore, docId, version),
  cloudDisconnectApp: (id) => ipcRenderer.invoke(IPC.cloudDisconnectApp, id)
}

contextBridge.exposeInMainWorld('quill', api)
