/**
 * Development-only stand-in for the preload bridge so the renderer can be opened in a plain
 * browser tab (for visual checks). Never active inside Electron, where the preload defines window.quill.
 */
import type { QuillApi } from '../shared/types'

export function installDevShim(): void {
  if (window.quill || !import.meta.env.DEV) return
  const noop = (): (() => void) => () => undefined
  const dark = window.matchMedia('(prefers-color-scheme: dark)')
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
    openPath: async () => Promise.reject(new Error('Not available in the browser preview')),
    save: async () => ({ ok: false, canceled: true }),
    saveAs: async () => ({ ok: false, canceled: true }),
    exportPdf: async () => ({ ok: false, canceled: true }),
    pickImage: async () => null,
    revealPath: () => undefined,
    recentList: async () => [
      { path: '/Users/you/Documents/Garden Club/Garden Plan 2027.docx', name: 'Garden Plan 2027', dir: 'Documents › Garden Club', lastOpened: Date.now(), modified: Date.now() - 3_600_000, size: 12000 },
      { path: '/Users/you/Documents/Home/Lease Renewal Letter.docx', name: 'Lease Renewal Letter', dir: 'Documents › Home', lastOpened: Date.now() - 1, modified: Date.now() - 90_000_000, size: 9000 }
    ],
    recentRemove: async () => [],
    setDocumentState: () => undefined
  }
  window.quill = api
}
