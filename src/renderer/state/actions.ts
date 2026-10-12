import type { Editor } from '@tiptap/core'
import type { CloseReason, JSONContent } from '../../shared/types'
import { DEFAULT_PAGE_SETUP } from '../../shared/pageSetup'
import type { ExportChoice } from '../components/sheets/ExportSheet'
import { EMPTY_DOC, getState, loadDocument, setState } from './documentStore'
import type { PendingIntent } from './documentStore'

/** The live editor, set by the editor host while a document is open. */
export const editorRef: { current: Editor | null } = { current: null }

let savedJson = ''

export function markSaved(editor: Editor): void {
  savedJson = JSON.stringify(editor.getJSON())
  if (getState().dirty) setState({ dirty: false })
}

export function syncDirty(editor: Editor): void {
  const dirty = JSON.stringify(editor.getJSON()) !== savedJson
  if (dirty !== getState().dirty) setState({ dirty })
}

function currentJson(): JSONContent {
  return editorRef.current?.getJSON() ?? EMPTY_DOC
}

function guard(intent: PendingIntent): boolean {
  if (getState().screen === 'editor' && getState().dirty) {
    setState({ sheet: { kind: 'unsaved', intent } })
    return true
  }
  return false
}

export function newDocument(content: JSONContent | null): void {
  if (guard({ kind: 'new', content })) return
  loadDocument(content ?? EMPTY_DOC, { path: null, name: 'Untitled', pageSetup: DEFAULT_PAGE_SETUP })
}

export async function openDocument(path?: string): Promise<void> {
  if (guard({ kind: 'open', path })) return
  const doc = path ? await window.quill.openPath(path).catch((err: unknown) => ({ error: String(err) })) : await window.quill.openDialog()
  if (!doc) return
  if ('error' in doc) {
    setState({ notice: `Could not open file: ${doc.error}` })
    return
  }
  loadDocument(doc.json, { path: doc.path, name: doc.name, pageSetup: doc.pageSetup, notice: doc.warnings.length ? `Opened with ${doc.warnings.length} import ${doc.warnings.length === 1 ? 'note' : 'notes'}` : null })
}

/** A document opened from Finder / the Dock. */
export function receiveOpenedDocument(doc: { path: string; name: string; json: JSONContent; pageSetup: typeof DEFAULT_PAGE_SETUP }): void {
  if (guard({ kind: 'openDocument', ...doc })) return
  loadDocument(doc.json, { path: doc.path, name: doc.name, pageSetup: doc.pageSetup })
}

export async function saveDocument(opts: { as?: boolean } = {}): Promise<boolean> {
  const editor = editorRef.current
  if (!editor) return false
  const { path, name, pageSetup } = getState()
  const req = { path: opts.as ? null : path, suggestedName: name, json: editor.getJSON(), pageSetup }
  const result = opts.as || !path ? await window.quill.saveAs({ ...req, path: opts.as ? path : null }) : await window.quill.save(req)
  if (!result.ok) {
    if ('error' in result) setState({ notice: `Save failed: ${result.error}` })
    return false
  }
  setState({ path: result.path, name: result.name, notice: null })
  markSaved(editor)
  return true
}

export async function exportDocument(choice: ExportChoice): Promise<void> {
  const editor = editorRef.current
  if (!editor) return
  setState({ pageSetup: choice.pageSetup, sheet: null })
  if (choice.format === 'docx') {
    const result = await window.quill.saveAs({ path: null, suggestedName: choice.fileName, json: editor.getJSON(), pageSetup: choice.pageSetup })
    if (result.ok) {
      setState({ path: result.path, name: result.name })
      markSaved(editor)
    } else if ('error' in result) {
      setState({ notice: `Export failed: ${result.error}` })
    }
    return
  }
  // Give the layout a frame to apply the new page setup before printing.
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  const result = await window.quill.exportPdf({ suggestedName: choice.fileName, pageSetup: choice.pageSetup })
  if (!result.ok && 'error' in result) setState({ notice: `PDF export failed: ${result.error}` })
  else if (result.ok) setState({ notice: `Exported ${result.name}.pdf` })
}

export function exportPdfQuick(): void {
  const { name, pageSetup } = getState()
  void exportDocument({ format: 'pdf', fileName: name, pageSetup })
}

export function requestClose(reason: CloseReason): void {
  if (getState().screen === 'editor' && getState().dirty) {
    setState({ sheet: { kind: 'unsaved', intent: { kind: 'close', reason } } })
    return
  }
  window.quill.closeConfirmed(reason)
}

export function goToStart(): void {
  if (guard({ kind: 'start' })) return
  setState({ screen: 'start', sheet: null, dirty: false, path: null, name: 'Untitled' })
}

/** Carry out what the user wanted before the unsaved-changes sheet interrupted. */
export async function runIntent(intent: PendingIntent): Promise<void> {
  setState({ sheet: null, dirty: false })
  switch (intent.kind) {
    case 'new':
      loadDocument(intent.content ?? EMPTY_DOC, { path: null, name: 'Untitled', pageSetup: DEFAULT_PAGE_SETUP })
      break
    case 'open':
      await openDocument(intent.path)
      break
    case 'openDocument':
      loadDocument(intent.json, { path: intent.path, name: intent.name, pageSetup: intent.pageSetup })
      break
    case 'close':
      window.quill.closeConfirmed(intent.reason)
      break
    case 'start':
      setState({ screen: 'start', path: null, name: 'Untitled' })
      break
  }
}

export function cancelSheet(): void {
  const sheet = getState().sheet
  if (sheet?.kind === 'unsaved' && sheet.intent.kind === 'close') window.quill.closeCanceled()
  setState({ sheet: null })
}

export { currentJson }
