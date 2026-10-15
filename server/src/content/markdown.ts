import type { JSONContent } from '../../../src/shared/types'

/*
 * A small Markdown dialect, enough for what a model writes when asked for a document:
 * headings (# ## ###), paragraphs, bullet and numbered lists (nested by indentation),
 * block quotes, horizontal rules, pipe tables, and inline **bold**, *italic*, ~~strike~~,
 * `code` and [links](url). Both directions, so get_document can hand Claude something
 * readable and create/insert can take it back.
 */

type Mark = { type: string; attrs?: Record<string, unknown> }

/* ---------- inline ---------- */

const INLINE = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(~~([^~]+)~~)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\n]+)\*)|(_([^_\n]+)_)/

export function inlineToNodes(text: string, marks: Mark[] = []): JSONContent[] {
  const out: JSONContent[] = []
  let rest = text
  while (rest.length) {
    const m = INLINE.exec(rest)
    if (!m) {
      pushText(out, rest, marks)
      break
    }
    if (m.index > 0) pushText(out, rest.slice(0, m.index), marks)
    if (m[1]) out.push(...inlineToNodes(m[2], [...marks, { type: 'bold' }]))
    else if (m[3]) out.push(...inlineToNodes(m[4], [...marks, { type: 'bold' }]))
    else if (m[5]) out.push(...inlineToNodes(m[6], [...marks, { type: 'strike' }]))
    else if (m[7]) pushText(out, m[8], [...marks, { type: 'code' }])
    else if (m[9]) out.push(...inlineToNodes(m[10], [...marks, { type: 'link', attrs: { href: m[11], target: null, rel: 'noopener' } }]))
    else if (m[12]) out.push(...inlineToNodes(m[13], [...marks, { type: 'italic' }]))
    else if (m[14]) out.push(...inlineToNodes(m[15], [...marks, { type: 'italic' }]))
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

function pushText(out: JSONContent[], text: string, marks: Mark[]): void {
  if (!text) return
  const parts = text.split(/ {2,}\n|\\\n/)
  parts.forEach((part, i) => {
    if (i > 0) out.push({ type: 'hardBreak' })
    const clean = part.replace(/\n/g, ' ')
    if (clean) out.push(marks.length ? { type: 'text', text: clean, marks } : { type: 'text', text: clean })
  })
}

/* ---------- blocks ---------- */

const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: inlineToNodes(text.trim()) })

interface ListLine {
  indent: number
  ordered: boolean
  text: string
}

function parseList(lines: ListLine[]): JSONContent {
  const ordered = lines[0].ordered
  const items: JSONContent[] = []
  let i = 0
  while (i < lines.length) {
    const base = lines[i].indent
    const item: JSONContent = { type: 'listItem', content: [paragraph(lines[i].text)] }
    i += 1
    const nested: ListLine[] = []
    while (i < lines.length && lines[i].indent > base) nested.push(lines[i++])
    if (nested.length) item.content!.push(parseList(nested))
    items.push(item)
  }
  return { type: ordered ? 'orderedList' : 'bulletList', content: items }
}

function parseTable(rows: string[]): JSONContent | null {
  const cells = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r))
  if (!body.length) return null
  const hasHeader = rows.length > 1 && /^\s*\|?\s*:?-{2,}/.test(rows[1])
  const width = Math.max(...body.map((r) => cells(r).length))
  const row = (line: string, header: boolean): JSONContent => {
    const cs = cells(line)
    while (cs.length < width) cs.push('')
    return { type: 'tableRow', content: cs.map((c) => ({ type: header ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [paragraph(c)] })) }
  }
  return { type: 'table', content: body.map((line, i) => row(line, hasHeader && i === 0)) }
}

export function markdownToBlocks(md: string): JSONContent[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const blocks: JSONContent[] = []
  let i = 0
  const flushParagraph = (buf: string[]): void => {
    if (buf.length) blocks.push(paragraph(buf.join('\n')))
    buf.length = 0
  }
  const para: string[] = []
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph(para)
      i += 1
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph(para)
      const level = Math.min(3, heading[1].length)
      blocks.push({ type: 'heading', attrs: { level, textAlign: null, indent: 0 }, content: inlineToNodes(heading[2].trim()) })
      i += 1
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(para)
      blocks.push({ type: 'horizontalRule' })
      i += 1
      continue
    }
    if (/^>\s?/.test(trimmed)) {
      flushParagraph(para)
      const quote: string[] = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''))
      blocks.push({ type: 'blockquote', content: quote.join('\n').split(/\n\s*\n/).map(paragraph) })
      continue
    }
    const list = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (list) {
      flushParagraph(para)
      const items: ListLine[] = []
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!m) break
        items.push({ indent: m[1].replace(/\t/g, '  ').length, ordered: /\d/.test(m[2]), text: m[3] })
        i += 1
      }
      blocks.push(parseList(items))
      continue
    }
    if (/^\|.*\|\s*$/.test(trimmed)) {
      flushParagraph(para)
      const rows: string[] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      const table = parseTable(rows)
      if (table) blocks.push(table)
      continue
    }
    para.push(line)
    i += 1
  }
  flushParagraph(para)
  return blocks
}

/* ---------- JSON → markdown ---------- */

function inlineToMarkdown(nodes: JSONContent[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n'
      if (n.type !== 'text') return ''
      let t = n.text ?? ''
      const marks = n.marks ?? []
      const has = (k: string): boolean => marks.some((m) => m.type === k)
      if (has('code')) t = `\`${t}\``
      if (has('bold')) t = `**${t}**`
      if (has('italic')) t = `*${t}*`
      if (has('strike')) t = `~~${t}~~`
      const link = marks.find((m) => m.type === 'link')
      if (link?.attrs?.href) t = `[${t}](${String(link.attrs.href)})`
      return t
    })
    .join('')
}

export function blockText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(blockText).join('')
}

function listToMarkdown(node: JSONContent, depth: number): string {
  const ordered = node.type === 'orderedList'
  return (node.content ?? [])
    .map((item, i) => {
      const marker = ordered ? `${i + 1}.` : '-'
      const [first, ...rest] = item.content ?? []
      const head = `${'  '.repeat(depth)}${marker} ${first ? inlineToMarkdown(first.content) : ''}`
      const tail = rest.map((r) => (r.type === 'bulletList' || r.type === 'orderedList' ? listToMarkdown(r, depth + 1) : `${'  '.repeat(depth + 1)}${inlineToMarkdown(r.content)}`)).join('\n')
      return tail ? `${head}\n${tail}` : head
    })
    .join('\n')
}

export function blockToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case 'title':
      return `# ${inlineToMarkdown(node.content)}`
    case 'heading':
      return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inlineToMarkdown(node.content)}`
    case 'paragraph':
      return inlineToMarkdown(node.content)
    case 'blockquote':
      return (node.content ?? []).map((p) => `> ${inlineToMarkdown(p.content)}`).join('\n')
    case 'bulletList':
    case 'orderedList':
      return listToMarkdown(node, 0)
    case 'horizontalRule':
      return '---'
    case 'pageBreak':
      return '<!-- page break -->'
    case 'image':
      return `![${String(node.attrs?.alt ?? 'image')}](image)`
    case 'table': {
      const rows = (node.content ?? []).map((r) => (r.content ?? []).map((c) => inlineToMarkdown((c.content ?? [])[0]?.content).replace(/\|/g, '\\|')))
      if (!rows.length) return ''
      const width = Math.max(...rows.map((r) => r.length))
      const line = (cells: string[]): string => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
      return [line(rows[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n')
    }
    default:
      return blockText(node)
  }
}

export function docToMarkdown(json: JSONContent): string {
  return (json.content ?? []).map(blockToMarkdown).join('\n\n')
}

/** One line per top-level block: `[index] type: first 80 characters`. The addressing aid for edits. */
export function outline(json: JSONContent): string {
  return (json.content ?? [])
    .map((b, i) => {
      const label = b.type === 'heading' ? `h${String(b.attrs?.level ?? 1)}` : (b.type ?? 'block')
      const text = blockText(b).replace(/\s+/g, ' ').trim()
      return `[${i}] ${label}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`
    })
    .join('\n')
}
