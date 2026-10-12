import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { buildDocx } from '../src/main/docx/build'
import { fontSizeToPt, runOptionsFromMarks, toHex, wordHighlightName } from '../src/main/docx/marks'
import { DEFAULT_PAGE_SETUP } from '../src/shared/pageSetup'
import type { JSONContent } from '../src/shared/types'
import { sampleDoc } from './fixtures/sampleDoc'

async function unzipDocx(json: JSONContent, setup = DEFAULT_PAGE_SETUP) {
  const buffer = await buildDocx(json, setup)
  const zip = await JSZip.loadAsync(buffer)
  const read = async (name: string) => (await zip.file(name)?.async('string')) ?? ''
  return {
    buffer,
    zip,
    document: await read('word/document.xml'),
    styles: await read('word/styles.xml'),
    numbering: await read('word/numbering.xml'),
    contentTypes: await read('[Content_Types].xml')
  }
}

const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })
const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })

describe('marks → run options', () => {
  it('maps the inline marks', () => {
    const opts = runOptionsFromMarks([
      { type: 'bold' },
      { type: 'italic' },
      { type: 'underline' },
      { type: 'strike' },
      { type: 'textStyle', attrs: { color: '#d13b2c', fontSize: '14pt', fontFamily: 'Georgia, serif' } },
      { type: 'highlight', attrs: { color: '#FFFF00' } },
      { type: 'link', attrs: { href: 'https://example.com' } }
    ])
    expect(opts.bold).toBe(true)
    expect(opts.italics).toBe(true)
    expect(opts.underline).toBeTruthy()
    expect(opts.strike).toBe(true)
    expect(opts.color).toBe('D13B2C')
    expect(opts.size).toBe(28)
    expect(opts.font).toBe('Georgia')
    expect(opts.highlight).toBe('yellow')
    expect(opts.href).toBe('https://example.com')
  })

  it('uses shading for highlight colours Word has no name for', () => {
    const opts = runOptionsFromMarks([{ type: 'highlight', attrs: { color: '#FFE58A' } }])
    expect(opts.highlight).toBeUndefined()
    expect(opts.shading?.fill).toBe('FFE58A')
  })

  it('normalises colours and font sizes', () => {
    expect(toHex('#abc')).toBe('AABBCC')
    expect(toHex('rgb(31, 95, 214)')).toBe('1F5FD6')
    expect(toHex('yellow')).toBe('FFFF00')
    expect(wordHighlightName('#00ff00')).toBe('green')
    expect(fontSizeToPt('18px')).toBe(13.5)
    expect(fontSizeToPt('11pt')).toBe(11)
    expect(fontSizeToPt('bogus')).toBeNull()
  })
})

describe('TipTap JSON → docx', () => {
  it('produces a valid package with the expected parts', async () => {
    const { contentTypes, document, styles, numbering } = await unzipDocx(sampleDoc)
    expect(contentTypes).toContain('word/document.xml')
    expect(document).toContain('<w:body>')
    expect(styles).toContain('w:styleId="Heading1"')
    expect(styles).toContain('w:styleId="Title"')
    expect(styles).toContain('w:styleId="Quote"')
    expect(numbering).toContain('<w:abstractNum')
  })

  it('maps paragraph styles to real Word style ids', async () => {
    const { document } = await unzipDocx(
      doc(
        { type: 'title', content: [text('T')] },
        { type: 'heading', attrs: { level: 1 }, content: [text('One')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('Two')] },
        { type: 'heading', attrs: { level: 3 }, content: [text('Three')] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('Q')] }] }
      )
    )
    for (const id of ['Title', 'Heading1', 'Heading2', 'Heading3', 'Quote']) {
      expect(document).toContain(`<w:pStyle w:val="${id}"/>`)
    }
  })

  it('writes run formatting', async () => {
    const { document } = await unzipDocx(
      doc({
        type: 'paragraph',
        content: [
          text('b', [{ type: 'bold' }]),
          text('i', [{ type: 'italic' }]),
          text('u', [{ type: 'underline' }]),
          text('s', [{ type: 'strike' }]),
          text('c', [{ type: 'textStyle', attrs: { color: '#FF0000', fontSize: '20pt', fontFamily: 'Georgia' } }]),
          text('h', [{ type: 'highlight', attrs: { color: '#00FFFF' } }])
        ]
      })
    )
    expect(document).toMatch(/<w:b\/>/)
    expect(document).toMatch(/<w:i\/>/)
    expect(document).toMatch(/<w:u w:val="single"\/>/)
    expect(document).toMatch(/<w:strike\/>/)
    expect(document).toContain('<w:color w:val="FF0000"/>')
    expect(document).toContain('<w:sz w:val="40"/>')
    expect(document).toContain('w:ascii="Georgia"')
    expect(document).toContain('<w:highlight w:val="cyan"/>')
  })

  it('writes alignment, indentation, rules and page breaks', async () => {
    const { document } = await unzipDocx(
      doc(
        { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('c')] },
        { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [text('j')] },
        { type: 'paragraph', attrs: { indent: 2 }, content: [text('i')] },
        { type: 'horizontalRule' },
        { type: 'pageBreak' }
      )
    )
    expect(document).toContain('<w:jc w:val="center"/>')
    expect(document).toContain('<w:jc w:val="both"/>')
    expect(document).toContain('<w:ind w:left="1440"/>')
    expect(document).toContain('<w:pStyle w:val="HorizontalRule"/>')
    expect(document).toContain('<w:br w:type="page"/>')
  })

  it('numbers nested lists and restarts each ordered list', async () => {
    const li = (t: string, nested?: JSONContent): JSONContent => ({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [text(t)] }, ...(nested ? [nested] : [])]
    })
    const { document, numbering } = await unzipDocx(
      doc(
        { type: 'bulletList', content: [li('a', { type: 'bulletList', content: [li('a.1')] })] },
        { type: 'orderedList', content: [li('1')] },
        { type: 'orderedList', content: [li('1 again')] }
      )
    )
    expect(document).toContain('<w:ilvl w:val="0"/>')
    expect(document).toContain('<w:ilvl w:val="1"/>')
    // two ordered lists → two separate numbering instances (plus one for bullets)
    const numIds = new Set([...document.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1]))
    expect(numIds.size).toBe(3)
    expect(numbering).toContain('w:val="bullet"')
    expect(numbering).toContain('w:val="decimal"')
  })

  it('writes tables with header rows and merged cells', async () => {
    const { document } = await unzipDocx(sampleDoc)
    expect(document).toContain('<w:tbl>')
    expect(document).toContain('<w:tblHeader/>')
    expect(document).toContain('<w:gridSpan w:val="2"/>')
    expect(document).toContain('<w:shd w:fill="F4F4F6"')
  })

  it('embeds images as media parts', async () => {
    const { zip, document, contentTypes } = await unzipDocx(sampleDoc)
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !f.endsWith('/'))
    expect(media.length).toBe(1)
    expect(contentTypes).toContain('png')
    expect(document).toContain('<w:drawing>')
  })

  it('writes hyperlinks with the Hyperlink style', async () => {
    const { document, zip } = await unzipDocx(sampleDoc)
    expect(document).toContain('<w:hyperlink')
    expect(document).toContain('<w:rStyle w:val="Hyperlink"/>')
    const rels = await zip.file('word/_rels/document.xml.rels')?.async('string')
    expect(rels).toContain('https://example.com/shifts')
  })

  it('honours page size and margins', async () => {
    const letter = await unzipDocx(doc(), { paper: 'letter', margins: 'normal' })
    expect(letter.document).toContain('w:w="12240"')
    expect(letter.document).toContain('w:top="1440"')
    const a4 = await unzipDocx(doc(), { paper: 'a4', margins: 'narrow' })
    expect(a4.document).toContain('w:w="11906"')
    expect(a4.document).toContain('w:left="720"')
  })
})
