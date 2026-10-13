import { generateJSON } from '@tiptap/html/server'
import mammoth from 'mammoth'
import { schemaExtensions } from '../../shared/schema/extensions'
import type { JSONContent, PageSetup } from '../../shared/types'
import { prepassDocx } from './importPrepass'
import { ComboRegistry, expandClasses, tagDocument } from './importStyleMap'

export interface ImportResult {
  json: JSONContent
  pageSetup: PageSetup
  warnings: string[]
}

interface MammothImage {
  contentType: string
  altText?: string
  readAsBase64String(): Promise<string>
}

/** The prepass writes "qimg:WxH|alt" into each picture's description so we can size it here. */
function imageWithSize(image: MammothImage): Promise<Record<string, string>> {
  return image.readAsBase64String().then((b64) => {
    const attrs: Record<string, string> = { src: `data:${image.contentType};base64,${b64}` }
    const m = /^qimg:(\d+)x(\d+)\|?([\s\S]*)$/.exec(image.altText ?? '')
    if (m) {
      if (parseInt(m[1], 10) > 0) attrs.width = m[1]
      if (parseInt(m[2], 10) > 0) attrs.height = m[2]
      attrs.alt = m[3]
    }
    return attrs
  })
}

/** Produces the HTML that mammoth generates for a .docx, with Quill's synthetic classes expanded. */
export async function docxToHtml(input: Buffer): Promise<{ html: string; pageSetup: PageSetup; warnings: string[] }> {
  const pre = await prepassDocx(input)
  const registry = new ComboRegistry()

  // Pass 1: discover every paragraph/run formatting combination so we can generate style-map rules.
  await mammoth.convertToHtml(
    { buffer: pre.buffer },
    {
      transformDocument: tagDocument(registry) as never,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' }))
    }
  )

  // Pass 2: the real conversion with the generated rules.
  const result = await mammoth.convertToHtml(
    { buffer: pre.buffer },
    {
      styleMap: registry.styleMap(),
      includeDefaultStyleMap: true,
      ignoreEmptyParagraphs: false,
      transformDocument: tagDocument(registry) as never,
      convertImage: mammoth.images.imgElement(imageWithSize as never)
    }
  )

  const warnings = result.messages
    .filter((m) => m.type === 'warning' || m.type === 'error')
    .map((m) => m.message)
    .filter((msg) => !/Unrecognised (paragraph|run) style|was referenced but not defined/i.test(msg))

  return { html: expandClasses(result.value), pageSetup: pre.pageSetup, warnings }
}

export async function importDocx(input: Buffer): Promise<ImportResult> {
  const { html, pageSetup, warnings } = await docxToHtml(input)
  const json = generateJSON(html, schemaExtensions()) as JSONContent
  return { json, pageSetup, warnings }
}
