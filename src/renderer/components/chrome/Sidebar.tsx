import { useState } from 'react'
import type { ReactNode } from 'react'
import type { OutlineEntry } from '../../editor/commands'
import { SearchField, Seg, TBtn } from '../controls'

type View = 'headings' | 'pages' | 'results'

export function Sidebar({ outline, currentPos, pages, currentPage, onJump, onJumpPage, onHide }: { outline: OutlineEntry[]; currentPos: number; pages: number; currentPage: number; onJump: (pos: number) => void; onJumpPage: (page: number) => void; onHide: () => void }): ReactNode {
  const [view, setView] = useState<View>('headings')
  const [query, setQuery] = useState('')
  const currentIndex = outline.reduce((acc, e, i) => (e.pos <= currentPos ? i : acc), -1)
  const q = query.trim().toLowerCase()
  const filtered = outline.map((e, i) => ({ e, i })).filter(({ e }) => !q || e.text.toLowerCase().includes(q))
  return (
    <aside className="q-sidebar q-nav" aria-label="Navigation">
      <div className="q-nav-head">
        <span>Navigation</span>
        <TBtn label="Hide navigation" icon="hide-navigation" small style={{ color: 'var(--q-text-secondary)' }} onClick={onHide} />
      </div>
      <SearchField value={query} onChange={setQuery} placeholder="Search headings" label="Search headings" style={{ width: '100%' }} />
      <Seg<View>
        label="Navigation view"
        value={view}
        onChange={(v) => v !== 'results' && setView(v)}
        options={[
          { value: 'headings', label: 'Headings' },
          { value: 'pages', label: 'Pages' },
          { value: 'results', label: <span style={{ color: 'var(--q-text-tertiary)' }}>Results</span> }
        ]}
        style={{ display: 'flex' }}
      />
      {view === 'headings' ? (
        <nav className="q-nav-list" aria-label="Document outline">
          {filtered.length === 0 ? <div className="q-nav-empty">{outline.length === 0 ? 'Headings you add will appear here.' : 'No headings match.'}</div> : null}
          {filtered.map(({ e, i }) => (
            <a
              key={`${e.pos}-${i}`}
              href="#"
              className={['q-outline', `l${e.level}`, i === currentIndex ? 'is-current' : ''].join(' ')}
              aria-current={i === currentIndex ? 'location' : undefined}
              onClick={(ev) => {
                ev.preventDefault()
                onJump(e.pos)
              }}
            >
              <span className="q-outline-text">{e.text}</span>
            </a>
          ))}
        </nav>
      ) : (
        <nav className="q-nav-list" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => (
            <a
              key={i}
              href="#"
              className={['q-outline', 'l1', i + 1 === currentPage ? 'is-current' : ''].join(' ')}
              onClick={(ev) => {
                ev.preventDefault()
                onJumpPage(i)
              }}
            >
              <span className="q-outline-text">Page {i + 1}</span>
            </a>
          ))}
        </nav>
      )}
    </aside>
  )
}
