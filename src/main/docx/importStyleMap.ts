import { WORD_HIGHLIGHTS } from './marks'
import { parseRunStyleId } from './importPrepass'
import { STYLE_NAMES } from './styles'

/* ------------------------------------------------------------------ */
/*  mammoth document model (the subset we read). mammoth has no types. */
/* ------------------------------------------------------------------ */

export interface MammothElement {
  type: string
  children?: MammothElement[]
  styleId?: string | null
  styleName?: string | null
  alignment?: string | null
  indent?: { start?: string | null; end?: string | null; firstLine?: string | null; hanging?: string | null }
  numbering?: { level: string; isOrdered: boolean } | null
  isBold?: boolean
  isItalic?: boolean
  font?: string | null
  fontSize?: number | null
  highlight?: string | null
  [key: string]: unknown
}

type Base = 'title' | 'h1' | 'h2' | 'h3' | 'quote' | 'hr' | 'p'
type Align = 'left' | 'center' | 'right' | 'justify'

export interface ParagraphCombo {
  base: Base
  align: Align | null
  indent: number
}

export interface RunCombo {
  sizePt: number | null
  font: string | null
  color: string | null
  shading: string | null
  highlight: string | null
}

const hexEncode = (s: string): string => Buffer.from(s, 'utf8').toString('hex')
const hexDecode = (s: string): string => Buffer.from(s, 'hex').toString('utf8')

function baseFor(styleName: string | null | undefined, styleId: string | null | undefined): Base {
  const name = (styleName ?? '').trim().toLowerCase()
  const id = (styleId ?? '').trim().toLowerCase()
  if (name === 'title' || id === 'title') return 'title'
  const h = /^heading\s*(\d)$/.exec(name) ?? /^heading(\d)$/.exec(id)
  if (h) {
    const level = parseInt(h[1], 10)
    return level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3'
  }
  if (name === 'quote' || name === 'intense quote' || id === 'quote' || id === 'intensequote') return 'quote'
  if (name === STYLE_NAMES.hr.toLowerCase() || id === 'horizontalrule') return 'hr'
  return 'p'
}

function alignFor(alignment: string | null | undefined): Align | null {
  switch (alignment) {
    case 'center':
      return 'center'
    case 'right':
    case 'end':
      return 'right'
    case 'both':
    case 'justify':
    case 'distribute':
      return 'justify'
    case 'left':
    case 'start':
      return 'left'
    default:
      return null
  }
}

function indentFor(indent: MammothElement['indent']): number {
  const raw = indent?.start
  const twips = raw ? parseInt(raw, 10) : 0
  if (!Number.isFinite(twips) || twips <= 0) return 0
  return Math.min(8, Math.round(twips / 720))
}

export function paragraphComboId(c: ParagraphCombo): string {
  return `qp-${c.base}-${c.align ?? 'none'}-${c.indent}`
}

export function parseParagraphComboId(id: string): ParagraphCombo | null {
  const m = /^qp-(title|h1|h2|h3|quote|hr|p)-(left|center|right|justify|none)-(\d)$/.exec(id)
  if (!m) return null
  return { base: m[1] as Base, align: m[2] === 'none' ? null : (m[2] as Align), indent: parseInt(m[3], 10) }
}

export function runComboId(c: RunCombo): string | null {
  const parts: string[] = []
  if (c.sizePt) parts.push(`s${Math.round(c.sizePt * 10)}`)
  if (c.font) parts.push(`f${hexEncode(c.font)}`)
  if (c.color) parts.push(`c${c.color}`)
  if (c.shading) parts.push(`h${c.shading}`)
  if (c.highlight) parts.push(`g${c.highlight}`)
  return parts.length ? `qr-${parts.join('-')}` : null
}

export function parseRunComboId(id: string): RunCombo | null {
  if (!id.startsWith('qr-')) return null
  const c: RunCombo = { sizePt: null, font: null, color: null, shading: null, highlight: null }
  for (const part of id.slice(3).split('-')) {
    const key = part[0]
    const val = part.slice(1)
    if (key === 's') c.sizePt = parseInt(val, 10) / 10
    else if (key === 'f') c.font = hexDecode(val)
    else if (key === 'c') c.color = val
    else if (key === 'h') c.shading = val
    else if (key === 'g') c.highlight = val
  }
  return c
}

/* ------------------------------------------------------------------ */
/*  Pass 1 collects combos; both passes tag the document with them.    */
/* ------------------------------------------------------------------ */

export class ComboRegistry {
  readonly paragraphs = new Map<string, ParagraphCombo>()
  readonly runs = new Map<string, RunCombo>()

  /** mammoth style map rules for everything collected, in a stable order. */
  styleMap(): string[] {
    const rules: string[] = []
    for (const [id, c] of this.paragraphs) {
      const tag = c.base === 'title' || c.base === 'h1' ? 'h1' : c.base === 'h2' ? 'h2' : c.base === 'h3' ? 'h3' : c.base === 'hr' ? 'hr' : 'p'
      if (c.base === 'quote') rules.push(`p.${id} => blockquote > p.${id}:fresh`)
      else if (c.base === 'hr') rules.push(`p.${id} => hr.${id}`)
      else rules.push(`p.${id} => ${tag}.${id}:fresh`)
    }
    for (const [id, c] of this.runs) {
      if (c.highlight || c.shading) rules.push(`r.${id} => mark.${id} > span.${id}`)
      else rules.push(`r.${id} => span.${id}`)
    }
    rules.push("br[type='page'] => hr.page-break")
    // mammoth drops underline unless told to keep it.
    rules.push('u => u')
    return rules
  }
}

/** Returns a mammoth `transformDocument` function that rewrites style ids to synthetic combo ids. */
export function tagDocument(registry: ComboRegistry): (doc: MammothElement) => MammothElement {
  const visit = (el: MammothElement): MammothElement => {
    if (el.type === 'paragraph') {
      if (!el.numbering) {
        const combo: ParagraphCombo = {
          base: baseFor(el.styleName, el.styleId),
          align: alignFor(el.alignment),
          indent: indentFor(el.indent)
        }
        const id = paragraphComboId(combo)
        registry.paragraphs.set(id, combo)
        el.styleId = id
      }
    } else if (el.type === 'run') {
      // Word's built-in character styles that mammoth would otherwise map to strong/em.
      const name = (el.styleName ?? '').toLowerCase()
      if (name === 'strong') el.isBold = true
      if (name === 'emphasis') el.isItalic = true
      const injected = el.styleId ? parseRunStyleId(el.styleId) : null
      const combo: RunCombo = {
        sizePt: el.fontSize ?? null,
        font: el.font ?? null,
        color: injected?.color ?? null,
        shading: injected?.shading ?? null,
        highlight: el.highlight && WORD_HIGHLIGHTS[el.highlight] ? el.highlight : null
      }
      const id = runComboId(combo)
      if (id) {
        registry.runs.set(id, combo)
        el.styleId = id
        el.highlight = null
      }
    }
    if (Array.isArray(el.children)) el.children = el.children.map(visit)
    return el
  }
  return visit
}

/* ------------------------------------------------------------------ */
/*  Post-process mammoth's HTML: turn combo classes into attributes     */
/*  TipTap's parse rules understand.                                    */
/* ------------------------------------------------------------------ */

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function expandClasses(html: string): string {
  let out = html.replace(/<(\w+) class="(qp-[\w-]+)"(\s*\/?)>/g, (_m, tag: string, id: string, close: string) => {
    const c = parseParagraphComboId(id)
    if (!c) return `<${tag}${close}>`
    const attrs: string[] = []
    if (c.base === 'title') attrs.push('class="q-title"')
    if (c.align) attrs.push(`data-align="${c.align}"`, `style="text-align: ${c.align}"`)
    if (c.indent > 0) attrs.push(`data-indent="${c.indent}"`)
    return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${close}>`
  })
  out = out.replace(/<(span|mark) class="(qr-[\w-]+)">/g, (_m, tag: string, id: string) => {
    const c = parseRunComboId(id)
    if (!c) return `<${tag}>`
    if (tag === 'mark') {
      const hex = c.shading ?? (c.highlight ? WORD_HIGHLIGHTS[c.highlight] : null)
      return hex ? `<mark data-color="#${hex}">` : '<mark>'
    }
    const styles: string[] = []
    if (c.sizePt) styles.push(`font-size: ${c.sizePt}pt`)
    if (c.font) styles.push(`font-family: ${escapeAttr(c.font.includes(' ') ? `'${c.font}'` : c.font)}`)
    if (c.color) styles.push(`color: #${c.color}`)
    return styles.length ? `<span style="${styles.join('; ')}">` : '<span>'
  })
  // mammoth wraps pictures and page breaks in the paragraph that held them; ProseMirror would
  // otherwise leave an empty paragraph behind when it lifts the block node out.
  out = out.replace(/<p(?: [^>]*)?>(<img [^>]*\/>)<\/p>/g, '$1')
  out = out.replace(/<p(?: [^>]*)?>(<hr class="page-break" \/>)<\/p>/g, '$1')
  return out
}
