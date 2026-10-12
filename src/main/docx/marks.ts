import { ShadingType, UnderlineType } from 'docx'
import type { IRunOptions } from 'docx'
import type { JSONContent } from '../../shared/types'

type Mark = NonNullable<JSONContent['marks']>[number]

/** Word's 16 highlight colours (w:highlight values) and their sRGB hex. */
export type WordHighlight = NonNullable<IRunOptions['highlight']>

export const WORD_HIGHLIGHTS: Record<string, string> = {
  yellow: 'FFFF00',
  green: '00FF00',
  cyan: '00FFFF',
  magenta: 'FF00FF',
  blue: '0000FF',
  red: 'FF0000',
  darkBlue: '000080',
  darkCyan: '008080',
  darkGreen: '008000',
  darkMagenta: '800080',
  darkRed: '800000',
  darkYellow: '808000',
  darkGray: '808080',
  lightGray: 'C0C0C0',
  black: '000000'
}

const HEX_TO_HIGHLIGHT: Record<string, string> = Object.fromEntries(
  Object.entries(WORD_HIGHLIGHTS).map(([name, hex]) => [hex, name])
)

/** Normalise any CSS colour we produce (#rgb, #rrggbb, rgb(), named Word highlight) to 'RRGGBB'. */
export function toHex(color: string | null | undefined): string | null {
  if (!color) return null
  const c = color.trim()
  if (WORD_HIGHLIGHTS[c]) return WORD_HIGHLIGHTS[c]
  const m6 = /^#?([0-9a-f]{6})$/i.exec(c)
  if (m6) return m6[1].toUpperCase()
  const m3 = /^#?([0-9a-f]{3})$/i.exec(c)
  if (m3) {
    return m3[1]
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toUpperCase()
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c)
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  }
  return null
}

/** Word highlight name for a colour, when it is one of the 16 Word highlights. */
export function wordHighlightName(color: string | null | undefined): WordHighlight | null {
  const hex = toHex(color)
  return hex ? ((HEX_TO_HIGHLIGHT[hex] as WordHighlight | undefined) ?? null) : null
}

/** "14pt" | "18px" | "1.5rem" | "14" → points, or null. */
export function fontSizeToPt(value: unknown): number | null {
  if (typeof value === 'number') return value > 0 ? value : null
  if (typeof value !== 'string') return null
  const m = /^\s*([\d.]+)\s*(pt|px|rem|em)?\s*$/i.exec(value)
  if (!m) return null
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n <= 0) return null
  switch ((m[2] ?? 'pt').toLowerCase()) {
    case 'px':
      return Math.round(n * 0.75 * 2) / 2
    case 'rem':
    case 'em':
      return Math.round(n * 12 * 2) / 2
    default:
      return Math.round(n * 2) / 2
  }
}

/** First font in a CSS font-family list, unquoted. */
export function primaryFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const first = value.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '')
  return first ? first : null
}

export interface MarkRunOptions {
  bold?: boolean
  italics?: boolean
  underline?: IRunOptions['underline']
  strike?: boolean
  color?: string
  /** Half-points. */
  size?: number
  font?: string
  /** One of Word's highlight names. */
  highlight?: IRunOptions['highlight']
  shading?: IRunOptions['shading']
  subScript?: boolean
  superScript?: boolean
  /** Present when the text carries a link mark. */
  href?: string
}

/** Translate a TipTap text node's marks into docx TextRun options. */
export function runOptionsFromMarks(marks: Mark[] | undefined): MarkRunOptions {
  const out: MarkRunOptions = {}
  for (const mark of marks ?? []) {
    const attrs = mark.attrs ?? {}
    switch (mark.type) {
      case 'bold':
        out.bold = true
        break
      case 'italic':
        out.italics = true
        break
      case 'underline':
        out.underline = { type: UnderlineType.SINGLE }
        break
      case 'strike':
        out.strike = true
        break
      case 'subscript':
        out.subScript = true
        break
      case 'superscript':
        out.superScript = true
        break
      case 'code':
        out.font = 'Menlo'
        break
      case 'link':
        if (typeof attrs.href === 'string') out.href = attrs.href
        break
      case 'textStyle': {
        const color = toHex(attrs.color as string | undefined)
        if (color) out.color = color
        const pt = fontSizeToPt(attrs.fontSize)
        if (pt) out.size = Math.round(pt * 2)
        const font = primaryFontFamily(attrs.fontFamily)
        if (font) out.font = font
        const bg = toHex(attrs.backgroundColor as string | undefined)
        if (bg) out.shading = { type: ShadingType.CLEAR, fill: bg, color: 'auto' }
        break
      }
      case 'highlight': {
        const raw = (attrs.color as string | undefined) ?? 'yellow'
        const name = wordHighlightName(raw)
        if (name) {
          out.highlight = name
        } else {
          const hex = toHex(raw)
          if (hex) out.shading = { type: ShadingType.CLEAR, fill: hex, color: 'auto' }
        }
        break
      }
      default:
        break
    }
  }
  return out
}
