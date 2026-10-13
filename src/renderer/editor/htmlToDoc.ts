import { generateJSON } from '@tiptap/html'
import { schemaExtensions } from '../../shared/schema/extensions'
import type { JSONContent } from '../../shared/types'

/** Parse importer HTML into TipTap JSON using the editor schema (needs a DOM, so it lives in the renderer). */
export function htmlToDoc(html: string): JSONContent {
  return generateJSON(html, schemaExtensions()) as JSONContent
}
