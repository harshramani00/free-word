import { describe, expect, it } from 'vitest'
import type { JSONContent } from '../../src/shared/types'
import { EditError, findHeading, insertBlocks, replaceBlocks, replaceSection, replaceText, sectionEnd } from '../src/content/edit'
import { validateBlocks } from '../src/content/load'
import { blockText, docToMarkdown, markdownToBlocks, outline } from '../src/content/markdown'

const text = (t: string, marks?: { type: string; attrs?: Record<string, unknown> }[]): JSONContent => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })
const p = (...c: JSONContent[]): JSONContent => ({ type: 'paragraph', content: c })
const h = (level: number, t: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [text(t)] })

const sample = (): JSONContent => ({
  type: 'doc',
  content: [{ type: 'title', content: [text('Lease Renewal Letter')] }, p(text('Dear '), text('Ms. Okafor', [{ type: 'bold' }]), text(', thank you.')), h(2, 'Renewal terms'), p(text('Rent is $1,850 per month.')), h(3, 'Pets'), p(text('Cats are fine.')), h(2, 'Payment'), p(text('Bank transfer.'))]
})

describe('markdown', () => {
  it('parses headings, lists, tables, quotes, rules and inline marks into valid blocks', () => {
    const blocks = markdownToBlocks(`# Title\n\nA paragraph with **bold**, *italic*, ~~gone~~, \`code\` and [a link](https://example.com).\nSame paragraph.\n\n- one\n- two\n  - nested\n\n1. first\n2. second\n\n> quoted\n\n---\n\n| Item | Cost |\n| --- | --- |\n| Soil | $40 |\n`)
    expect(() => validateBlocks(blocks)).not.toThrow()
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletList', 'orderedList', 'blockquote', 'horizontalRule', 'table'])
    const para = blocks[1]
    expect(para.content?.find((n) => n.marks?.some((m) => m.type === 'bold'))?.text).toBe('bold')
    expect(para.content?.find((n) => n.marks?.some((m) => m.type === 'link'))?.marks?.[0].attrs?.href).toBe('https://example.com')
    expect(blockText(para)).toContain('Same paragraph.')
    expect(blocks[2].content?.[1].content?.[1].type).toBe('bulletList')
    expect(blocks[6].content?.[0].content?.[0].type).toBe('tableHeader')
  })

  it('renders JSON back to markdown and builds an outline', () => {
    const md = docToMarkdown(sample())
    expect(md).toContain('# Lease Renewal Letter')
    expect(md).toContain('Dear **Ms. Okafor**, thank you.')
    expect(md).toContain('## Renewal terms')
    expect(outline(sample()).split('\n')[2]).toBe('[2] h2: Renewal terms')
  })
})

describe('edits', () => {
  it('finds headings and section ends', () => {
    const doc = sample()
    expect(findHeading(doc, 'renewal terms')).toEqual([2])
    expect(findHeading(doc, 'Terms')).toEqual([2])
    expect(sectionEnd(doc, 2)).toBe(6)
    expect(sectionEnd(doc, 4)).toBe(6)
    expect(sectionEnd(doc, 6)).toBe(8)
  })

  it('inserts after a heading, at the end of a section, and by index', () => {
    const block = p(text('New line'))
    expect(insertBlocks(sample(), [block], { afterHeading: 'Renewal terms' }).content?.[3]).toEqual(block)
    expect(insertBlocks(sample(), [block], { afterHeading: 'Renewal terms', endOfSection: true }).content?.[6]).toEqual(block)
    expect(insertBlocks(sample(), [block], { position: 'start' }).content?.[0]).toEqual(block)
    expect(insertBlocks(sample(), [block], { afterBlockIndex: 7 }).content?.[8]).toEqual(block)
    expect(() => insertBlocks(sample(), [block], { afterHeading: 'Nope' })).toThrow(EditError)
    expect(() => insertBlocks(sample(), [block], { afterBlockIndex: 99 })).toThrow(EditError)
  })

  it('replaces blocks with a staleness guard and whole sections', () => {
    const out = replaceBlocks(sample(), 3, 3, [p(text('Rent is $1,900.'))], 'Rent is $1,850')
    expect(blockText(out.content![3])).toBe('Rent is $1,900.')
    expect(() => replaceBlocks(sample(), 3, 3, [p(text('x'))], 'Something else')).toThrow(/re-read/)
    const section = replaceSection(sample(), 'Renewal terms', [p(text('Only this.'))])
    expect(section.content?.map(blockText)).toEqual(['Lease Renewal Letter', 'Dear Ms. Okafor, thank you.', 'Renewal terms', 'Only this.', 'Payment', 'Bank transfer.'])
  })

  it('replaces text inside one run and across runs, keeping marks', () => {
    const one = replaceText(sample(), '$1,850', '$1,900')
    expect(one.count).toBe(1)
    expect(blockText(one.doc.content![3])).toBe('Rent is $1,900 per month.')

    const across = replaceText(sample(), 'Dear Ms. Okafor,', 'Hello Ms. Okafor,')
    expect(across.count).toBe(1)
    const para = across.doc.content![1]
    expect(blockText(para)).toBe('Hello Ms. Okafor, thank you.')
    expect(para.content?.[0].marks).toBeUndefined()

    const all = replaceText({ type: 'doc', content: [p(text('a cat and a cat')), p(text('cat'))] }, 'cat', 'dog', { all: true })
    expect(all.count).toBe(3)
    expect(all.doc.content?.map(blockText)).toEqual(['a dog and a dog', 'dog'])
    expect(() => replaceText(sample(), 'unicorn', 'x')).toThrow(/not found/)
    expect(replaceText(sample(), 'RENT', 'Fee').count).toBe(1)
    expect(() => replaceText(sample(), 'RENT', 'x', { matchCase: true })).toThrow(/not found/)
  })

  it('never mutates its input', () => {
    const doc = sample()
    const before = JSON.stringify(doc)
    replaceText(doc, 'Rent', 'Fee')
    insertBlocks(doc, [p(text('x'))], { position: 'end' })
    replaceSection(doc, 'Payment', [])
    expect(JSON.stringify(doc)).toBe(before)
  })
})
