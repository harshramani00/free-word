import type { JSONContent } from '../../src/shared/types'

/** 1×1 red PNG. */
export const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='
export const RED_PNG_DATA_URL = `data:image/png;base64,${RED_PNG_BASE64}`

const text = (t: string, marks?: JSONContent['marks']): JSONContent => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })
const p = (content: JSONContent[], attrs?: Record<string, unknown>): JSONContent => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content })
const li = (...content: JSONContent[]): JSONContent => ({ type: 'listItem', content })
const cell = (type: 'tableCell' | 'tableHeader', content: JSONContent[], attrs: Record<string, unknown> = {}): JSONContent => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
  content
})

/** A document that uses every element and mark Quill supports. */
export const sampleDoc: JSONContent = {
  type: 'doc',
  content: [
    { type: 'title', content: [text('Riverside Community Garden')] },
    { type: 'heading', attrs: { level: 1 }, content: [text('Overview')] },
    p([
      text('This plan sets out how we will run the garden. '),
      text('Bold', [{ type: 'bold' }]),
      text(', '),
      text('italic', [{ type: 'italic' }]),
      text(', '),
      text('underlined', [{ type: 'underline' }]),
      text(' and '),
      text('struck', [{ type: 'strike' }]),
      text('.')
    ]),
    p([text('Centered paragraph.')], { textAlign: 'center' }),
    p([text('Right-aligned paragraph.')], { textAlign: 'right' }),
    p([text('Justified paragraph with enough words to make the alignment meaningful when it wraps.')], { textAlign: 'justify' }),
    p([text('Indented one level.')], { indent: 1 }),
    p([
      text('Red text', [{ type: 'textStyle', attrs: { color: '#D13B2C' } }]),
      text(' and '),
      text('big text', [{ type: 'textStyle', attrs: { fontSize: '18pt' } }]),
      text(' and '),
      text('Georgia text', [{ type: 'textStyle', attrs: { fontFamily: 'Georgia' } }]),
      text(' and '),
      text('highlighted', [{ type: 'highlight', attrs: { color: '#FFFF00' } }]),
      text(' and a '),
      text('link', [{ type: 'link', attrs: { href: 'https://example.com/shifts' } }]),
      text('.')
    ]),
    { type: 'heading', attrs: { level: 2 }, content: [text('Plot allocation')] },
    {
      type: 'bulletList',
      content: [
        li(p([text('Standard bed')])),
        li(
          p([text('Accessible bed')]),
          { type: 'bulletList', content: [li(p([text('Waist height')])), li(p([text('Reserved on request')]))] }
        ),
        li(p([text('Shared herb beds')]))
      ]
    },
    { type: 'heading', attrs: { level: 3 }, content: [text('Water schedule')] },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [li(p([text('North beds')])), li(p([text('East beds')])), li(p([text('South beds')]))]
    },
    { type: 'blockquote', content: [p([text('Everyone who gardens here works at least two shifts a season.')])] },
    { type: 'horizontalRule' },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [cell('tableHeader', [p([text('Item')])]), cell('tableHeader', [p([text('2026')])]), cell('tableHeader', [p([text('2027')])])]
        },
        {
          type: 'tableRow',
          content: [cell('tableCell', [p([text('Soil')])]), cell('tableCell', [p([text('$1,180')])]), cell('tableCell', [p([text('$1,450')])])]
        },
        {
          type: 'tableRow',
          content: [cell('tableCell', [p([text('Merged across two columns')])], { colspan: 2 }), cell('tableCell', [p([text('$700')])])]
        }
      ]
    },
    { type: 'image', attrs: { src: RED_PNG_DATA_URL, alt: 'Red square', title: null, width: 120, height: 80 } },
    { type: 'pageBreak' },
    p([text('After the page break.')])
  ]
}
