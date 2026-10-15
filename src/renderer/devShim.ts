/**
 * Development-only stand-in for the preload bridge so the renderer can be opened in a plain
 * browser tab (for visual checks). Never active inside Electron, where the preload defines window.quill.
 */
import type { CloudRow, CloudState } from '../shared/cloud'
import type { QuillApi } from '../shared/types'

export function installDevShim(): void {
  if (window.quill || !import.meta.env.DEV) return
  const noop = (): (() => void) => () => undefined
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
  const unavailable = (): Promise<never> => Promise.reject(new Error('Not available in the browser preview'))
  const now = Date.now()
  const cloudState: CloudState = {
    enabled: true,
    account: { id: 'u1', email: 'harsh@example.com', name: 'Harsh Ramani', quotaBytes: 5 * 1024 ** 3, usedBytes: 1.2 * 1024 ** 3, serverUrl: 'https://quill.harsh.ts.net', folder: '/Users/you/Documents/Quill', connectedApps: [{ id: 'g1', clientId: 'c1', clientName: 'Claude', scope: 'documents:read documents:write', createdAt: now - 2 * 86_400_000, lastUsedAt: now - 3_600_000 }] },
    online: true,
    lastSyncAt: now,
    pendingUploads: 0,
    connectorUrl: 'https://quill.harsh.ts.net/mcp'
  }
  const rows: CloudRow[] = [
    { id: 'd1', name: 'Board Meeting Notes — Oct 15', path: '', currentVersion: 1, size: 14000, sha256: 'a', createdAt: now - 1_200_000, updatedAt: now - 1_200_000, updatedBy: 'claude', note: 'Drafted from your notes', deletedAt: null, localPath: null, localVersion: null, status: 'cloud-only' },
    { id: 'd2', name: 'Lease Renewal Letter', path: 'Home', currentVersion: 8, size: 22000, sha256: 'b', createdAt: now - 10 * 86_400_000, updatedAt: now - 3_600_000, updatedBy: 'claude', note: 'Added the payment terms table', deletedAt: null, localPath: '/Users/you/Documents/Quill/Home/Lease Renewal Letter.docx', localVersion: 7, status: 'newer-on-cloud' },
    { id: 'd3', name: 'Garden Plan 2027', path: 'Garden Club', currentVersion: 3, size: 18000, sha256: 'c', createdAt: now - 20 * 86_400_000, updatedAt: now - 7_200_000, updatedBy: 'user', note: null, deletedAt: null, localPath: '/Users/you/Documents/Quill/Garden Club/Garden Plan 2027.docx', localVersion: 3, status: 'synced' },
    { id: 'd4', name: 'Reading List 2026', path: '', currentVersion: 2, size: 9000, sha256: 'd', createdAt: now - 30 * 86_400_000, updatedAt: now - 8_000_000, updatedBy: 'user', note: null, deletedAt: null, localPath: '/Users/you/Documents/Quill/Reading List 2026.docx', localVersion: 2, status: 'pending-upload' }
  ]
  const api: QuillApi = {
    platform: 'browser',
    getTheme: async () => (dark.matches ? 'dark' : 'light'),
    onTheme: (cb) => {
      const h = (): void => cb(dark.matches ? 'dark' : 'light')
      dark.addEventListener('change', h)
      return () => dark.removeEventListener('change', h)
    },
    onMenu: noop,
    onOpenDocument: noop,
    onConfirmClose: noop,
    closeConfirmed: () => undefined,
    closeCanceled: () => undefined,
    openDialog: async () => null,
    openPath: unavailable,
    save: async () => ({ ok: false, canceled: true }),
    saveAs: async () => ({ ok: false, canceled: true }),
    exportPdf: async () => ({ ok: false, canceled: true }),
    pickImage: async () => null,
    revealPath: () => undefined,
    recentList: async () => [
      { path: '/Users/you/Documents/Garden Club/Garden Plan 2027.docx', name: 'Garden Plan 2027', dir: 'Documents › Garden Club', lastOpened: now, modified: now - 3_600_000, size: 12000 },
      { path: '/Users/you/Documents/Home/Lease Renewal Letter.docx', name: 'Lease Renewal Letter', dir: 'Documents › Home', lastOpened: now - 1, modified: now - 90_000_000, size: 9000 }
    ],
    recentRemove: async () => [],
    setDocumentState: () => undefined,
    cloudState: async () => cloudState,
    onCloudState: noop,
    cloudList: async () => rows,
    onCloudList: noop,
    cloudRefresh: async () => undefined,
    cloudSignIn: unavailable,
    cloudSignOut: async () => undefined,
    cloudSetEnabled: async () => undefined,
    cloudChooseFolder: async () => null,
    cloudDownload: unavailable,
    cloudRemoveDownload: async () => undefined,
    cloudStopSyncing: async () => undefined,
    cloudUpload: unavailable,
    cloudVersions: async () => [
      { n: 8, size: 22000, sha256: 'b', createdAt: now - 3_600_000, updatedBy: 'claude', note: 'Added the payment terms table', baseVersion: 7 },
      { n: 7, size: 21000, sha256: 'x', createdAt: now - 86_400_000, updatedBy: 'user', note: null, baseVersion: 6 },
      { n: 6, size: 20000, sha256: 'y', createdAt: now - 3 * 86_400_000, updatedBy: 'user', note: null, baseVersion: 5 }
    ],
    cloudRestore: unavailable,
    cloudDisconnectApp: async () => undefined
  }
  window.quill = api
}
