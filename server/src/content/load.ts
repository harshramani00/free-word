import { getSchema } from '@tiptap/core'
import { generateJSON } from '@tiptap/html/server'
import { buildDocx } from '../../../src/main/docx/build'
import { importDocx } from '../../../src/main/docx/import'
import { schemaExtensions } from '../../../src/shared/schema/extensions'
import type { PageSetup } from '../../../src/shared/pageSetup'
import type { JSONContent } from '../../../src/shared/types'

export interface LoadedDoc {
  json: JSONContent
  pageSetup: PageSetup
  warnings: string[]
}

const extensions = schemaExtensions()
const schema = getSchema(extensions)

/** .docx bytes → editor JSON, through the same importer Quill uses, with a server-side DOM. */
export async function loadDocx(bytes: Buffer): Promise<LoadedDoc> {
  const { html, pageSetup, warnings } = await importDocx(bytes)
  const json = generateJSON(html, extensions) as JSONContent
  return { json, pageSetup, warnings }
}

/** Editor JSON → .docx bytes, through Quill's builder. */
export function saveDocx(json: JSONContent, pageSetup: PageSetup): Promise<Buffer> {
  return buildDocx(json, pageSetup)
}

/** Throws when the JSON does not fit Quill's document schema. */
export function validateDoc(json: JSONContent): void {
  schema.nodeFromJSON(json).check()
}

/** Validates a list of top-level blocks (what tools insert). */
export function validateBlocks(blocks: JSONContent[]): void {
  validateDoc({ type: 'doc', content: blocks })
}

const locks = new Map<string, Promise<unknown>>()

/** Serialises edits to one document so two Claude calls cannot interleave. */
export function withDocLock<T>(docId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(docId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  // The chain stored for the next caller never rejects; the caller gets the real outcome.
  const settled = next.then(
    () => undefined,
    () => undefined
  )
  locks.set(docId, settled)
  void settled.then(() => {
    if (locks.get(docId) === settled) locks.delete(docId)
  })
  return next
}
