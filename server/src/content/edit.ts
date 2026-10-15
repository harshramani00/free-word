import type { JSONContent } from '../../../src/shared/types'
import { blockText } from './markdown'

/*
 * Pure edits on editor JSON. Every function returns a new document and never
 * mutates its input, so a failed edit leaves nothing behind.
 */

export class EditError extends Error {}

const HEADING_TYPES = new Set(['heading', 'title'])

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function headingLevel(node: JSONContent): number {
  return node.type === 'title' ? 0 : Number(node.attrs?.level ?? 1)
}

/** Indices of top-level headings whose text matches (trimmed, case-insensitive; exact first, then contains). */
export function findHeading(json: JSONContent, text: string): number[] {
  const want = text.trim().toLowerCase()
  const blocks = json.content ?? []
  const exact: number[] = []
  const partial: number[] = []
  blocks.forEach((b, i) => {
    if (!HEADING_TYPES.has(b.type ?? '')) return
    const have = blockText(b).trim().toLowerCase()
    if (have === want) exact.push(i)
    else if (have.includes(want)) partial.push(i)
  })
  return exact.length ? exact : partial
}

function candidates(json: JSONContent): string {
  return (json.content ?? [])
    .map((b, i) => (HEADING_TYPES.has(b.type ?? '') ? `[${i}] ${blockText(b).trim()}` : null))
    .filter(Boolean)
    .join('; ')
}

/** Resolves a heading reference to one index or explains why it could not. */
export function resolveHeading(json: JSONContent, text: string): number {
  const found = findHeading(json, text)
  if (found.length === 1) return found[0]
  if (found.length === 0) throw new EditError(`No heading matches “${text}”. Headings: ${candidates(json) || 'none'}`)
  throw new EditError(`“${text}” matches ${found.length} headings (${found.map((i) => `[${i}]`).join(', ')}); use afterBlockIndex instead`)
}

/** Index just after the section that starts at `headingIndex` (before the next heading of the same or higher level). */
export function sectionEnd(json: JSONContent, headingIndex: number): number {
  const blocks = json.content ?? []
  const level = headingLevel(blocks[headingIndex])
  for (let i = headingIndex + 1; i < blocks.length; i++) {
    const b = blocks[i]
    if (HEADING_TYPES.has(b.type ?? '') && headingLevel(b) <= level) return i
  }
  return blocks.length
}

export type InsertAt = { position: 'start' | 'end' } | { afterHeading: string; endOfSection?: boolean } | { afterBlockIndex: number } | { beforeBlockIndex: number }

export function insertBlocks(json: JSONContent, blocks: JSONContent[], at: InsertAt): JSONContent {
  const doc = clone(json)
  const list = doc.content ?? (doc.content = [])
  let index: number
  if ('position' in at) index = at.position === 'start' ? 0 : list.length
  else if ('afterHeading' in at) {
    const h = resolveHeading(doc, at.afterHeading)
    index = at.endOfSection ? sectionEnd(doc, h) : h + 1
  } else if ('afterBlockIndex' in at) index = checkIndex(list, at.afterBlockIndex) + 1
  else index = checkIndex(list, at.beforeBlockIndex)
  list.splice(index, 0, ...clone(blocks))
  return doc
}

function checkIndex(list: JSONContent[], i: number): number {
  if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new EditError(`Block index ${i} is out of range (0–${list.length - 1})`)
  return i
}

export function replaceBlocks(json: JSONContent, start: number, end: number, blocks: JSONContent[], expectedText?: string): JSONContent {
  const doc = clone(json)
  const list = doc.content ?? []
  checkIndex(list, start)
  checkIndex(list, end)
  if (end < start) throw new EditError('endIndex must not be before startIndex')
  if (expectedText !== undefined) {
    const have = blockText(list[start]).trim()
    if (!have.toLowerCase().startsWith(expectedText.trim().toLowerCase())) throw new EditError(`Block ${start} now starts with “${have.slice(0, 60)}”, not “${expectedText.slice(0, 60)}”; re-read the document`)
  }
  list.splice(start, end - start + 1, ...clone(blocks))
  return doc
}

/** Replaces the whole section under a heading (heading stays) with new blocks. */
export function replaceSection(json: JSONContent, heading: string, blocks: JSONContent[]): JSONContent {
  const doc = clone(json)
  const h = resolveHeading(doc, heading)
  const end = sectionEnd(doc, h)
  doc.content!.splice(h + 1, end - h - 1, ...clone(blocks))
  return doc
}

export function deleteSection(json: JSONContent, heading: string): JSONContent {
  const doc = clone(json)
  const h = resolveHeading(doc, heading)
  const end = sectionEnd(doc, h)
  doc.content!.splice(h, end - h)
  return doc
}

/* ---------- text replacement across runs ---------- */

interface Piece {
  node: JSONContent
  start: number
  end: number
}

/** Replaces `find` with `replacement` in the inline content of one block; returns the number of matches. */
function replaceInline(node: JSONContent, find: string, replacement: string, all: boolean, matchCase: boolean): number {
  const inline = node.content
  if (!inline || !inline.some((n) => n.type === 'text')) return 0
  const pieces: Piece[] = []
  let text = ''
  for (const n of inline) {
    const s = n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : ''
    pieces.push({ node: n, start: text.length, end: text.length + s.length })
    text += s
  }
  const hay = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? find : find.toLowerCase()
  const ranges: [number, number][] = []
  let from = 0
  while (needle.length) {
    const i = hay.indexOf(needle, from)
    if (i < 0) break
    ranges.push([i, i + needle.length])
    from = i + needle.length
    if (!all) break
  }
  if (!ranges.length) return 0
  const out: JSONContent[] = []
  let r = 0
  for (const p of pieces) {
    if (p.node.type !== 'text') {
      // A hard break inside a match disappears with the matched text.
      const inside = ranges.some(([a, b]) => p.start >= a && p.end <= b)
      if (!inside) out.push(p.node)
      continue
    }
    let cursor = p.start
    const src = p.node.text ?? ''
    while (cursor < p.end) {
      while (r < ranges.length && ranges[r][1] <= cursor) r += 1
      const range = ranges[r]
      if (!range || range[0] >= p.end) {
        out.push({ ...p.node, text: src.slice(cursor - p.start) })
        cursor = p.end
        break
      }
      if (range[0] > cursor) out.push({ ...p.node, text: src.slice(cursor - p.start, range[0] - p.start) })
      if (range[0] >= p.start && range[0] < p.end) out.push({ ...p.node, text: replacement })
      cursor = Math.min(p.end, range[1])
    }
  }
  node.content = out.filter((n) => n.type !== 'text' || (n.text ?? '').length > 0)
  return ranges.length
}

export function replaceText(json: JSONContent, find: string, replacement: string, opts: { all?: boolean; matchCase?: boolean } = {}): { doc: JSONContent; count: number } {
  if (!find) throw new EditError('find must not be empty')
  const doc = clone(json)
  let count = 0
  const all = opts.all ?? false
  const walk = (node: JSONContent): void => {
    if (!all && count > 0) return
    if (node.content?.some((n) => n.type === 'text')) {
      count += replaceInline(node, find, replacement, all, opts.matchCase ?? false)
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(doc)
  if (count === 0) throw new EditError(`“${find}” was not found`)
  return { doc, count }
}
