import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import type { Alignment } from '../../shared/schema/textAlign'

export type ParagraphStyle = 'body' | 'title' | 'h1' | 'h2' | 'h3' | 'quote'

export const PARAGRAPH_STYLES: { id: ParagraphStyle; label: string; shortcut?: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'h1', label: 'Heading 1', shortcut: '⌥⌘1' },
  { id: 'h2', label: 'Heading 2', shortcut: '⌥⌘2' },
  { id: 'h3', label: 'Heading 3', shortcut: '⌥⌘3' },
  { id: 'body', label: 'Body', shortcut: '⌥⌘0' },
  { id: 'quote', label: 'Quote' }
]

/** The paragraph style at the selection. */
export function currentParagraphStyle(editor: Editor): ParagraphStyle {
  if (editor.isActive('title')) return 'title'
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('blockquote')) return 'quote'
  return 'body'
}

export function setParagraphStyle(editor: Editor, style: ParagraphStyle): void {
  const chain = editor.chain().focus()
  const inQuote = editor.isActive('blockquote')
  if (style === 'quote') {
    if (!inQuote) chain.setParagraph().wrapIn('blockquote')
    chain.run()
    return
  }
  if (inQuote) chain.lift('blockquote')
  switch (style) {
    case 'body':
      chain.setParagraph()
      break
    case 'title':
      chain.setTitle()
      break
    case 'h1':
      chain.setHeading({ level: 1 })
      break
    case 'h2':
      chain.setHeading({ level: 2 })
      break
    case 'h3':
      chain.setHeading({ level: 3 })
      break
  }
  chain.run()
}

export function setAlignment(editor: Editor, align: Alignment): void {
  editor.chain().focus().setTextAlign(align).run()
}

export function currentAlignment(editor: Editor): Alignment {
  for (const a of ['center', 'right', 'justify'] as Alignment[]) {
    if (editor.isActive({ textAlign: a })) return a
  }
  return 'left'
}

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]
export const DEFAULT_FONT_SIZE = 11

/** Font size at the selection in points (explicit mark, or the paragraph style's default). */
export function currentFontSize(editor: Editor): number {
  const raw = editor.getAttributes('textStyle').fontSize as string | undefined
  if (raw) {
    const n = parseFloat(raw)
    if (Number.isFinite(n)) return raw.endsWith('px') ? Math.round(n * 0.75 * 2) / 2 : n
  }
  if (editor.isActive('title')) return 28
  if (editor.isActive('heading', { level: 1 })) return 18
  if (editor.isActive('heading', { level: 2 })) return 14
  if (editor.isActive('heading', { level: 3 })) return 12
  if (editor.isActive('table')) return 10
  return DEFAULT_FONT_SIZE
}

export function setFontSize(editor: Editor, pt: number): void {
  editor.chain().focus().setFontSize(`${pt}pt`).run()
}

export function stepFontSize(editor: Editor, direction: 1 | -1): void {
  const current = currentFontSize(editor)
  const idx = FONT_SIZES.findIndex((s) => s >= current)
  let next: number
  if (direction > 0) next = idx === -1 ? FONT_SIZES[FONT_SIZES.length - 1] : FONT_SIZES[Math.min(FONT_SIZES.length - 1, FONT_SIZES[idx] > current ? idx : idx + 1)]
  else next = idx <= 0 ? FONT_SIZES[0] : FONT_SIZES[idx - 1]
  setFontSize(editor, next)
}

export interface FontOption {
  name: string
  css: string
  kind: 'serif' | 'sans' | 'mono' | 'hand'
  meta?: string
}

/** Fonts offered in the picker: the bundled document font plus fonts that ship with macOS. */
export const FONTS: FontOption[] = [
  { name: 'Source Serif 4', css: "'Source Serif 4', 'New York', Charter, Georgia, serif", kind: 'serif', meta: 'Default' },
  { name: 'Avenir Next', css: "'Avenir Next', Avenir, 'Helvetica Neue', sans-serif", kind: 'sans', meta: '12 styles' },
  { name: 'Baskerville', css: 'Baskerville, Georgia, serif', kind: 'serif', meta: '6 styles' },
  { name: 'Charter', css: "Charter, 'Bitstream Charter', Georgia, serif", kind: 'serif' },
  { name: 'Courier New', css: "'Courier New', Courier, monospace", kind: 'mono', meta: '4 styles' },
  { name: 'Georgia', css: 'Georgia, serif', kind: 'serif', meta: '4 styles' },
  { name: 'Gill Sans', css: "'Gill Sans', sans-serif", kind: 'sans' },
  { name: 'Helvetica Neue', css: "'Helvetica Neue', Helvetica, sans-serif", kind: 'sans', meta: '14 styles' },
  { name: 'Hoefler Text', css: "'Hoefler Text', Georgia, serif", kind: 'serif' },
  { name: 'Menlo', css: 'Menlo, monospace', kind: 'mono' },
  { name: 'New York', css: "'New York', Georgia, serif", kind: 'serif' },
  { name: 'Noteworthy', css: 'Noteworthy, cursive', kind: 'hand' },
  { name: 'Palatino', css: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif", kind: 'serif' },
  { name: 'SF Mono', css: "'SF Mono', ui-monospace, Menlo, monospace", kind: 'mono' },
  { name: 'SF Pro', css: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif", kind: 'sans' },
  { name: 'Times New Roman', css: "'Times New Roman', Times, serif", kind: 'serif', meta: '4 styles' },
  { name: 'Verdana', css: 'Verdana, Geneva, sans-serif', kind: 'sans' }
]

export function currentFontFamily(editor: Editor): string {
  const raw = editor.getAttributes('textStyle').fontFamily as string | undefined
  if (!raw) return FONTS[0].name
  const first = raw.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  return first || FONTS[0].name
}

export function setFontFamily(editor: Editor, font: FontOption | string): void {
  const css = typeof font === 'string' ? font : font.css
  if (typeof font !== 'string' && font.name === FONTS[0].name) {
    editor.chain().focus().unsetFontFamily().run()
    return
  }
  editor.chain().focus().setFontFamily(css).run()
}

export function insertTable(editor: Editor, rows: number, cols: number): void {
  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
}

export async function insertImageFromDisk(editor: Editor): Promise<void> {
  const picked = await window.quill.pickImage()
  if (!picked) return
  let { width, height } = picked
  if (!(width > 0 && height > 0)) {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 0, h: 0 })
      img.src = picked.dataUrl
    })
    width = dims.w
    height = dims.h
  }
  editor
    .chain()
    .focus()
    .setImage({ src: picked.dataUrl, alt: picked.name.replace(/\.[^.]+$/, ''), width: width || undefined, height: height || undefined } as never)
    .run()
}

export function setLink(editor: Editor, href: string): void {
  const url = href.trim()
  if (!url) {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    return
  }
  const normalized = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`
  if (editor.state.selection.empty && !editor.isActive('link')) {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text: normalized, marks: [{ type: 'link', attrs: { href: normalized } }] })
      .run()
    return
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: normalized }).run()
}

/** Outline entries for the navigation sidebar. */
export interface OutlineEntry {
  pos: number
  level: 1 | 2 | 3
  text: string
}

export function outlineOf(editor: Editor): OutlineEntry[] {
  const out: OutlineEntry[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'title') {
      out.push({ pos, level: 1, text: node.textContent || 'Untitled' })
      return false
    }
    if (node.type.name === 'heading') {
      const level = Math.min(3, Math.max(1, Number(node.attrs.level) || 1)) as 1 | 2 | 3
      out.push({ pos, level, text: node.textContent || `Heading ${level}` })
      return false
    }
    return node.type.name === 'doc' || node.isBlock
  })
  return out
}

export function scrollToPos(editor: Editor, pos: number): void {
  editor.chain().focus(pos + 1, { scrollIntoView: false }).run()
  const dom = editor.view.nodeDOM(pos)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/** Select the next (or previous) occurrence of `query` after the current selection, wrapping around. */
export function findNext(editor: Editor, query: string, backwards = false): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return false
  const matches: { from: number; to: number }[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const text = node.text.toLowerCase()
    let i = text.indexOf(q)
    while (i !== -1) {
      matches.push({ from: pos + i, to: pos + i + q.length })
      i = text.indexOf(q, i + 1)
    }
    return true
  })
  if (matches.length === 0) return false
  const { from, to } = editor.state.selection
  let target = backwards ? [...matches].reverse().find((m) => m.to <= from) : matches.find((m) => m.from >= to)
  if (!target) target = backwards ? matches[matches.length - 1] : matches[0]
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.from, target.to)).scrollIntoView()
  editor.view.dispatch(tr)
  editor.view.focus()
  return true
}

/** Number of matches of `query` in the document. */
export function countMatches(editor: Editor, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  let n = 0
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let i = text.indexOf(q)
      while (i !== -1) {
        n++
        i = text.indexOf(q, i + 1)
      }
    }
    return true
  })
  return n
}
