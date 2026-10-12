import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { FONTS } from '../../editor/commands'
import type { FontOption } from '../../editor/commands'
import { SearchField } from '../controls'
import { Menu, MenuHead, MenuSep } from './Menu'

const RECENT_KEY = 'quill.recentFonts.v1'
type Kind = 'all' | FontOption['kind']
const KINDS: { id: Kind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'serif', label: 'Serif' },
  { id: 'sans', label: 'Sans Serif' },
  { id: 'mono', label: 'Mono' },
  { id: 'hand', label: 'Handwriting' }
]

export function loadRecentFonts(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function pushRecentFont(name: string): void {
  try {
    const next = [name, ...loadRecentFonts().filter((n) => n !== name)].slice(0, 3)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

function Row({ font, current, onPick }: { font: FontOption; current: boolean; onPick: (f: FontOption) => void }): ReactNode {
  return (
    <button type="button" className="q-fontrow" role="option" aria-selected={current} style={{ fontFamily: font.css }} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(font)}>
      {font.name}
      {font.meta ? <span className="meta">{font.meta}</span> : null}
    </button>
  )
}

export function FontPicker({ current, inDocument, onPick }: { current: string; inDocument: string[]; onPick: (f: FontOption) => void }): ReactNode {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const recent = useMemo(() => loadRecentFonts(), [])
  const byName = (n: string): FontOption | undefined => FONTS.find((f) => f.name === n)
  const filtered = FONTS.filter((f) => (kind === 'all' || f.kind === kind) && f.name.toLowerCase().includes(query.trim().toLowerCase()))
  const docFonts = inDocument.map(byName).filter((f): f is FontOption => !!f)
  const recentFonts = recent.map(byName).filter((f): f is FontOption => !!f)
  return (
    <Menu role="listbox" label="Fonts" style={{ width: 304, padding: 6, maxHeight: 520, overflowY: 'auto' }}>
      <SearchField value={query} onChange={setQuery} placeholder="Search fonts" style={{ width: '100%', height: 28 }} />
      <div style={{ display: 'flex', gap: 4, padding: '8px 2px 6px', flexWrap: 'wrap' }}>
        {KINDS.map((k) => (
          <button key={k.id} type="button" className="q-chip" aria-pressed={kind === k.id} onMouseDown={(e) => e.preventDefault()} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <MenuSep />
      {!query && kind === 'all' && docFonts.length ? (
        <>
          <MenuHead>In this document</MenuHead>
          {docFonts.map((f) => (
            <Row key={f.name} font={f} current={f.name === current} onPick={onPick} />
          ))}
        </>
      ) : null}
      {!query && kind === 'all' && recentFonts.length ? (
        <>
          <MenuHead>Recent</MenuHead>
          {recentFonts.map((f) => (
            <Row key={f.name} font={f} current={f.name === current} onPick={onPick} />
          ))}
        </>
      ) : null}
      <MenuHead>All fonts</MenuHead>
      {filtered.map((f) => (
        <Row key={f.name} font={f} current={f.name === current} onPick={onPick} />
      ))}
      {filtered.length === 0 ? <div className="q-nav-empty">No fonts match “{query}”.</div> : null}
    </Menu>
  )
}
