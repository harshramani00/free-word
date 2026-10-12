import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import type { IParagraphOptions, ParagraphChild } from 'docx'
import { inToTwips, MARGINS, PAPER, TWIPS_PER_IN, PX_PER_IN } from '../../shared/pageSetup'
import type { JSONContent, PageSetup } from '../../shared/types'
import { runOptionsFromMarks } from './marks'
import { BULLET_REFERENCE, documentStyles, numberReference, numberingConfig, STYLE_IDS, TABLE_BORDER_COLOR, TABLE_HEAD_FILL } from './styles'

type Block = Paragraph | Table

interface BuildContext {
  /** Number of top-level ordered lists seen so far; each gets its own numbering instance. */
  orderedInstances: number
  /** Text column width in twips, used to cap images and size tables. */
  textWidthTwips: number
}

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED
}

const INDENT_TWIPS = 720

function alignmentOf(node: JSONContent): IParagraphOptions['alignment'] {
  const a = node.attrs?.textAlign
  return typeof a === 'string' ? ALIGN[a] : undefined
}

function indentOf(node: JSONContent): IParagraphOptions['indent'] {
  const level = Number(node.attrs?.indent) || 0
  return level > 0 ? { left: level * INDENT_TWIPS } : undefined
}

/* ---------------- inline content ---------------- */

function convertInline(nodes: JSONContent[] | undefined): ParagraphChild[] {
  const out: ParagraphChild[] = []
  let linkHref: string | null = null
  let linkRuns: TextRun[] = []

  const flushLink = (): void => {
    if (linkHref && linkRuns.length) {
      out.push(new ExternalHyperlink({ link: linkHref, children: linkRuns }))
    }
    linkHref = null
    linkRuns = []
  }

  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      const run = new TextRun({ break: 1 })
      if (linkHref) linkRuns.push(run)
      else out.push(run)
      continue
    }
    if (node.type !== 'text') continue
    const { href, ...runOpts } = runOptionsFromMarks(node.marks)
    const text = node.text ?? ''
    if (href) {
      if (linkHref !== href) {
        flushLink()
        linkHref = href
      }
      linkRuns.push(new TextRun({ ...runOpts, text, style: STYLE_IDS.hyperlink }))
    } else {
      flushLink()
      out.push(new TextRun({ ...runOpts, text }))
    }
  }
  flushLink()
  return out
}

/* ---------------- images ---------------- */

const IMAGE_TYPES = ['png', 'jpg', 'gif', 'bmp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

export function decodeDataUrl(src: unknown): { type: ImageType; data: Buffer } | null {
  if (typeof src !== 'string') return null
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/is.exec(src)
  if (!m) return null
  const sub = m[1].toLowerCase()
  const type: ImageType | null =
    sub === 'png' ? 'png' : sub === 'jpeg' || sub === 'jpg' ? 'jpg' : sub === 'gif' ? 'gif' : sub === 'bmp' ? 'bmp' : null
  if (!type) return null
  return { type, data: Buffer.from(m[2], 'base64') }
}

function imageParagraph(node: JSONContent, ctx: BuildContext): Paragraph | null {
  const decoded = decodeDataUrl(node.attrs?.src)
  if (!decoded) return null
  let width = Number(node.attrs?.width) || 0
  let height = Number(node.attrs?.height) || 0
  if (width <= 0 || height <= 0) {
    width = 480
    height = 320
  }
  const maxWidthPx = (ctx.textWidthTwips / TWIPS_PER_IN) * PX_PER_IN
  if (width > maxWidthPx) {
    height = Math.round((height * maxWidthPx) / width)
    width = Math.round(maxWidthPx)
  }
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : ''
  return new Paragraph({
    alignment: alignmentOf(node),
    children: [
      new ImageRun({
        type: decoded.type,
        data: decoded.data,
        transformation: { width, height },
        altText: { title: alt || 'Image', description: alt || 'Image', name: alt || 'Image' }
      })
    ]
  })
}

/* ---------------- tables ---------------- */

function isHeaderRow(row: JSONContent): boolean {
  const cells = row.content ?? []
  return cells.length > 0 && cells.every((c) => c.type === 'tableHeader')
}

function columnCount(table: JSONContent): number {
  let max = 0
  for (const row of table.content ?? []) {
    let n = 0
    for (const cell of row.content ?? []) n += Number(cell.attrs?.colspan) || 1
    max = Math.max(max, n)
  }
  return max || 1
}

function columnWidths(table: JSONContent, cols: number, ctx: BuildContext): number[] {
  const firstRow = table.content?.[0]
  const widths: number[] = []
  for (const cell of firstRow?.content ?? []) {
    const cw = cell.attrs?.colwidth
    const span = Number(cell.attrs?.colspan) || 1
    if (Array.isArray(cw) && cw.length === span && cw.every((w) => typeof w === 'number' && w > 0)) {
      for (const w of cw as number[]) widths.push(Math.round((w / PX_PER_IN) * TWIPS_PER_IN))
    } else {
      for (let i = 0; i < span; i++) widths.push(0)
    }
  }
  if (widths.length !== cols || widths.some((w) => w === 0)) {
    const each = Math.floor(ctx.textWidthTwips / cols)
    return Array.from({ length: cols }, () => each)
  }
  // Scale to the text width so the table never runs off the page.
  const total = widths.reduce((a, b) => a + b, 0)
  const scale = total > ctx.textWidthTwips ? ctx.textWidthTwips / total : 1
  return widths.map((w) => Math.round(w * scale))
}

function convertTable(node: JSONContent, ctx: BuildContext): Table {
  const cols = columnCount(node)
  const widths = columnWidths(node, cols, ctx)
  const rows = (node.content ?? [])
    .filter((r) => r.type === 'tableRow')
    .map((row) => {
      const header = isHeaderRow(row)
      let col = 0
      const cells = (row.content ?? []).map((cell) => {
        const colspan = Number(cell.attrs?.colspan) || 1
        const rowspan = Number(cell.attrs?.rowspan) || 1
        const width = widths.slice(col, col + colspan).reduce((a, b) => a + b, 0) || widths[0]
        col += colspan
        const children = convertBlocks(cell.content ?? [], ctx, { boldRuns: cell.type === 'tableHeader' })
        return new TableCell({
          columnSpan: colspan > 1 ? colspan : undefined,
          rowSpan: rowspan > 1 ? rowspan : undefined,
          width: { size: width, type: WidthType.DXA },
          shading: cell.type === 'tableHeader' ? { type: ShadingType.CLEAR, fill: TABLE_HEAD_FILL, color: 'auto' } : undefined,
          children: children.length ? children : [new Paragraph({})]
        })
      })
      return new TableRow({ tableHeader: header ? true : undefined, children: cells })
    })
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR }
    },
    rows
  })
}

/* ---------------- lists ---------------- */

interface ListFrame {
  reference: string
  level: number
}

function convertList(node: JSONContent, ctx: BuildContext, parent: ListFrame | null, opts: BlockOptions): Block[] {
  const ordered = node.type === 'orderedList'
  let reference: string
  if (ordered) {
    // Nested ordered lists share the parent's instance (deeper ilvl); a new top-level one restarts.
    reference = parent && parent.reference !== BULLET_REFERENCE ? parent.reference : numberReference(ctx.orderedInstances++)
  } else {
    reference = BULLET_REFERENCE
  }
  const level = parent ? Math.min(8, parent.level + 1) : 0
  const frame: ListFrame = { reference, level }
  const out: Block[] = []

  for (const item of node.content ?? []) {
    if (item.type !== 'listItem') continue
    let first = true
    for (const child of item.content ?? []) {
      if (child.type === 'paragraph' || child.type === 'heading' || child.type === 'title') {
        out.push(
          new Paragraph({
            numbering: first ? { reference, level } : undefined,
            indent: first ? undefined : { left: (level + 1) * INDENT_TWIPS },
            alignment: alignmentOf(child),
            children: convertInline(child.content)
          })
        )
        first = false
      } else if (child.type === 'bulletList' || child.type === 'orderedList') {
        out.push(...convertList(child, ctx, frame, opts))
      } else {
        out.push(...convertBlocks([child], ctx, opts))
      }
    }
  }
  return out
}

/* ---------------- blocks ---------------- */

interface BlockOptions {
  /** Inside a table header cell, make runs bold. */
  boldRuns?: boolean
  /** Inside a blockquote, use the Quote style. */
  quote?: boolean
}

function paragraphFrom(node: JSONContent, extra: IParagraphOptions, opts: BlockOptions): Paragraph {
  let children = convertInline(node.content)
  if (opts.boldRuns) {
    // Re-create runs with bold applied: simplest is to rebuild from JSON with a bold mark added.
    const boldContent = (node.content ?? []).map((n) =>
      n.type === 'text' ? { ...n, marks: [...(n.marks ?? []).filter((m) => m.type !== 'bold'), { type: 'bold' }] } : n
    )
    children = convertInline(boldContent)
  }
  return new Paragraph({
    ...extra,
    alignment: alignmentOf(node),
    indent: indentOf(node),
    children
  })
}

export function convertBlocks(nodes: JSONContent[], ctx: BuildContext, opts: BlockOptions = {}): Block[] {
  const out: Block[] = []
  for (const node of nodes) {
    switch (node.type) {
      case 'paragraph':
        out.push(paragraphFrom(node, opts.quote ? { style: STYLE_IDS.quote } : {}, opts))
        break
      case 'title':
        out.push(paragraphFrom(node, { style: STYLE_IDS.title }, opts))
        break
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1))
        const style = level === 1 ? STYLE_IDS.h1 : level === 2 ? STYLE_IDS.h2 : STYLE_IDS.h3
        out.push(paragraphFrom(node, { style }, opts))
        break
      }
      case 'blockquote':
        out.push(...convertBlocks(node.content ?? [], ctx, { ...opts, quote: true }))
        break
      case 'bulletList':
      case 'orderedList':
        out.push(...convertList(node, ctx, null, opts))
        break
      case 'horizontalRule':
        out.push(new Paragraph({ style: STYLE_IDS.hr }))
        break
      case 'pageBreak':
        out.push(new Paragraph({ children: [new PageBreak()] }))
        break
      case 'image': {
        const p = imageParagraph(node, ctx)
        if (p) out.push(p)
        break
      }
      case 'table':
        out.push(convertTable(node, ctx))
        break
      case 'codeBlock':
        out.push(
          new Paragraph({
            children: (node.content ?? []).map((t) => new TextRun({ text: t.text ?? '', font: 'Menlo' }))
          })
        )
        break
      default:
        // Unknown block: keep its text so nothing silently disappears.
        if (node.content?.some((c) => c.type === 'text')) {
          out.push(paragraphFrom(node, {}, opts))
        } else if (node.content) {
          out.push(...convertBlocks(node.content, ctx, opts))
        }
    }
  }
  return out
}

/* ---------------- document ---------------- */

/** Count top-level ordered lists so numbering instances can be declared up front. */
function countOrderedLists(nodes: JSONContent[] | undefined, inOrdered = false): number {
  let n = 0
  for (const node of nodes ?? []) {
    if (node.type === 'orderedList') {
      if (!inOrdered) n += 1
      n += countOrderedLists(node.content, true)
    } else if (node.type === 'bulletList') {
      n += countOrderedLists(node.content, false)
    } else {
      n += countOrderedLists(node.content, inOrdered)
    }
  }
  return n
}

export function buildDocument(json: JSONContent, pageSetup: PageSetup): Document {
  const paper = PAPER[pageSetup.paper]
  const margins = MARGINS[pageSetup.margins]
  const pageWidth = inToTwips(paper.widthIn)
  const pageHeight = inToTwips(paper.heightIn)
  const margin = {
    top: inToTwips(margins.topIn),
    bottom: inToTwips(margins.bottomIn),
    left: inToTwips(margins.leftIn),
    right: inToTwips(margins.rightIn)
  }
  const ctx: BuildContext = {
    orderedInstances: 0,
    textWidthTwips: pageWidth - margin.left - margin.right
  }
  const orderedCount = Math.max(1, countOrderedLists(json.content))
  const children = convertBlocks(json.content ?? [], ctx)

  return new Document({
    creator: 'Quill',
    description: 'Created with Quill',
    styles: documentStyles(),
    numbering: numberingConfig(orderedCount),
    sections: [
      {
        properties: {
          page: { size: { width: pageWidth, height: pageHeight }, margin }
        },
        children: children.length ? children : [new Paragraph({})]
      }
    ]
  })
}

export async function buildDocx(json: JSONContent, pageSetup: PageSetup): Promise<Buffer> {
  const doc = buildDocument(json, pageSetup)
  return Packer.toBuffer(doc)
}
