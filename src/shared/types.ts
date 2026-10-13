import type { PageSetup } from './pageSetup'

export type { PageSetup, PaperSize, MarginPreset } from './pageSetup'

/** A TipTap/ProseMirror JSON document. Kept loose so shared/ does not depend on @tiptap. */
export interface JSONContent {
  type?: string
  attrs?: Record<string, unknown>
  content?: JSONContent[]
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  text?: string
  [key: string]: unknown
}

export type Theme = 'light' | 'dark'

export type ExportFormat = 'docx' | 'pdf'

export interface RecentEntry {
  path: string
  name: string
  /** Parent folder, shown as a breadcrumb ("Documents › Garden Club"). */
  dir: string
  lastOpened: number
  modified: number
  size: number
}

export interface OpenedDocument {
  path: string
  name: string
  json: JSONContent
  pageSetup: PageSetup
  warnings: string[]
}

export interface SaveRequest {
  /** Existing path to overwrite, or null to show a Save As dialog. */
  path: string | null
  suggestedName: string
  json: JSONContent
  pageSetup: PageSetup
}

export interface ExportPdfRequest {
  suggestedName: string
  pageSetup: PageSetup
  /** Write here without asking; otherwise a Save dialog is shown. */
  path?: string
}

export type SaveResult = { ok: true; path: string; name: string } | { ok: false; canceled: true } | { ok: false; error: string }

export interface PickedImage {
  dataUrl: string
  name: string
  width: number
  height: number
}

export interface DocumentState {
  title: string
  path: string | null
  dirty: boolean
}

export type CloseReason = 'close' | 'quit'

export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:saveAs'
  | 'file:export'
  | 'file:exportPdf'
  | 'file:close'
  | 'edit:undo'
  | 'edit:redo'
  | 'edit:link'
  | 'format:bold'
  | 'format:italic'
  | 'format:underline'
  | 'format:strike'
  | 'format:alignLeft'
  | 'format:alignCenter'
  | 'format:alignRight'
  | 'format:alignJustify'
  | 'format:bulletList'
  | 'format:orderedList'
  | 'format:indent'
  | 'format:outdent'
  | 'style:body'
  | 'style:title'
  | 'style:h1'
  | 'style:h2'
  | 'style:h3'
  | 'style:quote'
  | 'insert:table'
  | 'insert:image'
  | 'insert:hr'
  | 'insert:pageBreak'
  | 'view:zoomIn'
  | 'view:zoomOut'
  | 'view:zoomReset'
  | 'view:toggleNav'
  | 'view:toggleRuler'
  | 'view:toolbarSimple'
  | 'view:toolbarFull'

export interface QuillApi {
  platform: string
  /* Theme */
  getTheme(): Promise<Theme>
  onTheme(cb: (theme: Theme) => void): () => void
  /* Menu + app events */
  onMenu(cb: (action: MenuAction) => void): () => void
  onOpenDocument(cb: (doc: OpenedDocument) => void): () => void
  onConfirmClose(cb: (reason: CloseReason) => void): () => void
  closeConfirmed(reason: CloseReason): void
  closeCanceled(): void
  /* Files */
  openDialog(): Promise<OpenedDocument | null>
  openPath(path: string): Promise<OpenedDocument>
  save(req: SaveRequest): Promise<SaveResult>
  saveAs(req: SaveRequest): Promise<SaveResult>
  exportPdf(req: ExportPdfRequest): Promise<SaveResult>
  pickImage(): Promise<PickedImage | null>
  revealPath(path: string): void
  /* Recent */
  recentList(): Promise<RecentEntry[]>
  recentRemove(path: string): Promise<RecentEntry[]>
  /* Window */
  setDocumentState(state: DocumentState): void
}
