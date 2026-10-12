import { describe, expect, it } from 'vitest'
import { buildDocx } from '../src/main/docx/build'
import { importDocx } from '../src/main/docx/import'
import { DEFAULT_PAGE_SETUP } from '../src/shared/pageSetup'
import type { JSONContent } from '../src/shared/types'
import { RED_PNG_BASE64, sampleDoc } from './fixtures/sampleDoc'

function walk(node: JSONContent, visit: (n: JSONContent) => void): void {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

function findAll(node: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = []
  walk(node, (n) => {
    if (n.type === type) out.push(n)
  })
  return out
}

function textOf(node: JSONContent): string {
  let s = ''
  walk(node, (n) => {
    if (n.type === 'text') s += n.text ?? ''
  })
  return s
}

function textWithMark(node: JSONContent, markType: string, pred: (attrs: Record<string, unknown>) => boolean = () => true): string[] {
  const out: string[] = []
  walk(node, (n) => {
    if (n.type === 'text' && n.marks?.some((m) => m.type === markType && pred(m.attrs ?? {}))) out.push(n.text ?? '')
  })
  return out
}

describe('round trip: build → .docx → import', () => {
  it('preserves structure and formatting', async () => {
    const buffer = await buildDocx(sampleDoc, { paper: 'a4', margins: 'wide' })
    const { json, pageSetup, warnings } = await importDocx(buffer)
    expect(warnings).toEqual([])
    expect(pageSetup).toEqual({ paper: 'a4', margins: 'wide' })
    expect(json.type).toBe('doc')

    // Paragraph styles
    expect(findAll(json, 'title').map(textOf)).toEqual(['Riverside Community Garden'])
    const headings = findAll(json, 'heading')
    expect(headings.map((h) => [h.attrs?.level, textOf(h)])).toEqual([
      [1, 'Overview'],
      [2, 'Plot allocation'],
      [3, 'Water schedule']
    ])
    expect(findAll(json, 'blockquote').map(textOf)).toEqual(['Everyone who gardens here works at least two shifts a season.'])

    // Inline marks
    expect(textWithMark(json, 'bold')).toContain('Bold')
    expect(textWithMark(json, 'italic')).toContain('italic')
    expect(textWithMark(json, 'underline')).toContain('underlined')
    expect(textWithMark(json, 'strike')).toContain('struck')
    expect(textWithMark(json, 'textStyle', (a) => String(a.color).toUpperCase() === '#D13B2C')).toContain('Red text')
    expect(textWithMark(json, 'textStyle', (a) => a.fontSize === '18pt')).toContain('big text')
    expect(textWithMark(json, 'textStyle', (a) => String(a.fontFamily).includes('Georgia'))).toContain('Georgia text')
    expect(textWithMark(json, 'highlight', (a) => String(a.color).toUpperCase() === '#FFFF00')).toContain('highlighted')
    expect(textWithMark(json, 'link', (a) => a.href === 'https://example.com/shifts')).toContain('link')

    // Alignment and indentation
    const paragraphs = findAll(json, 'paragraph')
    const byText = (t: string) => paragraphs.find((p) => textOf(p) === t)
    expect(byText('Centered paragraph.')?.attrs?.textAlign).toBe('center')
    expect(byText('Right-aligned paragraph.')?.attrs?.textAlign).toBe('right')
    expect(byText('Justified paragraph with enough words to make the alignment meaningful when it wraps.')?.attrs?.textAlign).toBe('justify')
    expect(byText('Indented one level.')?.attrs?.indent).toBe(1)

    // Lists, including nesting
    const bullets = findAll(json, 'bulletList')
    expect(bullets.length).toBe(2)
    const topBullet = bullets[0]
    expect(topBullet.content?.length).toBe(3)
    const nested = findAll(topBullet.content![1], 'bulletList')
    expect(nested.length).toBe(1)
    expect(nested[0].content?.map(textOf)).toEqual(['Waist height', 'Reserved on request'])
    const ordered = findAll(json, 'orderedList')
    expect(ordered.length).toBe(1)
    expect(ordered[0].content?.map(textOf)).toEqual(['North beds', 'East beds', 'South beds'])

    // Table with header row and a merged cell
    const tables = findAll(json, 'table')
    expect(tables.length).toBe(1)
    const rows = findAll(tables[0], 'tableRow')
    expect(rows.length).toBe(3)
    expect(rows[0].content?.every((c) => c.type === 'tableHeader')).toBe(true)
    expect(rows[0].content?.map(textOf)).toEqual(['Item', '2026', '2027'])
    const merged = rows[2].content?.[0]
    expect(merged?.attrs?.colspan).toBe(2)
    expect(textOf(merged!)).toBe('Merged across two columns')

    // Image bytes survive
    const images = findAll(json, 'image')
    expect(images.length).toBe(1)
    expect(String(images[0].attrs?.src)).toBe(`data:image/png;base64,${RED_PNG_BASE64}`)
    expect(images[0].attrs?.width).toBe(120)
    expect(images[0].attrs?.height).toBe(80)
    expect(images[0].attrs?.alt).toBe('Red square')

    // Rules and page breaks
    expect(findAll(json, 'horizontalRule').length).toBe(1)
    expect(findAll(json, 'pageBreak').length).toBe(1)
    expect(byText('After the page break.')).toBeTruthy()
  })

  it('imports a document twice without drift', async () => {
    const once = await importDocx(await buildDocx(sampleDoc, DEFAULT_PAGE_SETUP))
    const twice = await importDocx(await buildDocx(once.json, DEFAULT_PAGE_SETUP))
    expect(twice.json).toEqual(once.json)
  })
})
