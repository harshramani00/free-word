import type { JSONContent } from '../../../shared/types'

export interface Template {
  id: string
  name: string
  /** Thumbnail line spec, from the design: widths in %, h = heading, g = gap, b = block, l = list item. */
  spec: string
  content: JSONContent
}

const t = (text: string): JSONContent => ({ type: 'text', text })
const p = (...texts: string[]): JSONContent => ({ type: 'paragraph', content: texts.length ? texts.map(t) : undefined })
const h = (level: 1 | 2 | 3, text: string): JSONContent => ({ type: 'heading', attrs: { level }, content: [t(text)] })
const title = (text: string): JSONContent => ({ type: 'title', content: [t(text)] })
const ul = (...items: string[]): JSONContent => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) })
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

export const BLANK: JSONContent = doc(p())

export const TEMPLATES: Template[] = [
  {
    id: 'letter',
    name: 'Letter',
    spec: '40 50 32 g 26 g 100 100 90 100 56 g 100 94 60',
    content: doc(p('[Your name]'), p('[Street address]'), p('[City, State ZIP]'), p(), p('[Date]'), p(), p('[Recipient name]'), p('[Recipient address]'), p(), p('Dear [Recipient],'), p(), p('[Opening paragraph]'), p(), p('[Closing paragraph]'), p(), p('Sincerely,'), p(), p('[Your name]'))
  },
  {
    id: 'resume',
    name: 'Résumé',
    spec: 'h56 44 g h30 100 92 l70 l62 g h30 100 84 l66',
    content: doc(title('[Your name]'), p('[City] · [Phone] · [Email]'), h(2, 'Experience'), h(3, '[Role] — [Company]'), p('[Dates]'), ul('[Accomplishment]', '[Accomplishment]'), h(2, 'Education'), h(3, '[Degree] — [School]'), p('[Years]'), h(2, 'Skills'), ul('[Skill]', '[Skill]', '[Skill]'))
  },
  {
    id: 'report',
    name: 'Report',
    spec: 'h80 50 g g h40 100 100 94 100 g 100 90 100 64',
    content: doc(title('[Report title]'), p('[Subtitle or date]'), h(1, 'Summary'), p('[Summary]'), h(1, 'Background'), p('[Background]'), h(1, 'Findings'), p('[Findings]'), h(1, 'Recommendations'), ul('[Recommendation]', '[Recommendation]'))
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    spec: 'h64 36 g h28 l70 l56 l62 g h28 l66 l48',
    content: doc(title('[Meeting name]'), p('[Date] · [Attendees]'), h(2, 'Agenda'), ul('[Item]', '[Item]', '[Item]'), h(2, 'Decisions'), ul('[Decision]'), h(2, 'Action items'), ul('[Owner] — [Action] — [Due date]'))
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    spec: 'h90 g b g 100 100 88 g 100 96 72',
    content: doc(title('[Newsletter name]'), p('[Issue] · [Date]'), { type: 'horizontalRule' }, h(2, '[Lead story]'), p('[Story text]'), h(2, '[Second story]'), p('[Story text]'), h(3, 'Upcoming'), ul('[Event] — [Date]'))
  },
  {
    id: 'flyer',
    name: 'Flyer',
    spec: 'g h90 h70 g b b g 60 50',
    content: doc(p(), { type: 'title', attrs: { textAlign: 'center' }, content: [t('[Event name]')] }, { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [t('[Date and time]')] }, p(), { type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('[Location]')] }, p(), { type: 'paragraph', attrs: { textAlign: 'center' }, content: [t('[Details]')] })
  }
]

export interface ThumbLine {
  cls: string
  w: string
}

/** Ported from the design's thumbnail generator. */
export function thumbLines(spec: string): ThumbLine[] {
  return spec.split(' ').map((s) => {
    if (s === 'g') return { cls: 'q-tl-gap', w: '100%' }
    if (s[0] === 'h') return { cls: 'q-tl is-h', w: `${s.slice(1)}%` }
    if (s[0] === 'b') return { cls: 'q-tl is-blk', w: '100%' }
    if (s[0] === 'l') return { cls: 'q-tl is-li', w: `${s.slice(1)}%` }
    return { cls: 'q-tl', w: `${s}%` }
  })
}
