import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { JSONContent, RecentEntry } from '../../../shared/types'
import { loadPrefs, savePrefs } from '../../state/prefs'
import { Btn, Seg, SearchField } from '../controls'
import { Icon } from '../icons'
import { BLANK, TEMPLATES, thumbLines } from './templates'

export function formatEdited(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const today = new Date(now)
  const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const yesterday = new Date(now - 86_400_000)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay(d, today)) return `Today, ${time}`
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`
  if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function Thumb({ spec }: { spec: string }): ReactNode {
  return (
    <span className="q-tpl-thumb">
      <span className="q-tpl-page">
        {thumbLines(spec).map((l, i) => (
          <span key={i} className={l.cls} style={{ width: l.w }} />
        ))}
      </span>
    </span>
  )
}

export function StartScreen({ onNew, onOpen, onOpenPath }: { onNew: (content: JSONContent) => void; onOpen: () => void; onOpenPath: (path: string) => void }): ReactNode {
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>(() => loadPrefs().startView)
  useEffect(() => {
    let alive = true
    void window.quill.recentList().then((list) => alive && setRecent(list))
    return () => {
      alive = false
    }
  }, [])
  const filtered = useMemo(() => recent.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())), [recent, query])
  const changeView = (v: 'list' | 'grid'): void => {
    setView(v)
    savePrefs({ ...loadPrefs(), startView: v })
  }
  const remove = async (path: string): Promise<void> => setRecent(await window.quill.recentRemove(path))

  return (
    <div className="q-start">
      <nav className="q-sidebar q-start-rail" aria-label="Start">
        <Btn primary style={{ height: 32, width: '100%' }} onClick={() => onNew(BLANK)}>
          <Icon name="new-document" />
          New Document
        </Btn>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <a href="#" className="q-outline l1 is-current" style={{ gap: 8, paddingLeft: 8 }} onClick={(e) => e.preventDefault()}>
            <Icon name="home" />
            Home
          </a>
          <a href="#" className="q-outline l1 q-rail-link is-disabled" style={{ gap: 8, paddingLeft: 8, fontWeight: 400 }} aria-disabled="true" tabIndex={-1}>
            <Icon name="templates" />
            Templates
          </a>
          <a href="#" className="q-outline l1 q-rail-link is-disabled" style={{ gap: 8, paddingLeft: 8, fontWeight: 400 }} aria-disabled="true" tabIndex={-1}>
            <Icon name="pinned" />
            Pinned
          </a>
          <a
            href="#"
            className="q-outline l1"
            style={{ gap: 8, paddingLeft: 8, fontWeight: 400 }}
            onClick={(e) => {
              e.preventDefault()
              onOpen()
            }}
          >
            <Icon name="open" />
            Open…
          </a>
        </div>
      </nav>

      <main className="q-start-main">
        <section className="q-start-section">
          <div className="q-start-head" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
            <h1>New</h1>
          </div>
          <div className="q-tpl-row">
            <button type="button" className="q-tpl" onClick={() => onNew(BLANK)}>
              <span className="q-tpl-thumb">
                <span className="q-tpl-page" style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--q-accent)' }}>
                  <Icon name="new-document" style={{ width: 22, height: 22 }} />
                </span>
              </span>
              <span>Blank Document</span>
            </button>
            {TEMPLATES.map((tpl) => (
              <button key={tpl.id} type="button" className="q-tpl" onClick={() => onNew(tpl.content)}>
                <Thumb spec={tpl.spec} />
                <span>{tpl.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="q-start-section grow">
          <div className="q-start-head">
            <h2 style={{ flex: 1 }}>Recent</h2>
            <SearchField value={query} onChange={setQuery} placeholder="Search" label="Search recent documents" style={{ width: 240 }} />
            <Seg<'grid' | 'list'>
              label="View"
              icons
              value={view}
              onChange={changeView}
              options={[
                { value: 'grid', label: <Icon name="grid-view" />, title: 'Grid view' },
                { value: 'list', label: <Icon name="list-view" />, title: 'List view' }
              ]}
            />
            <Btn onClick={onOpen}>
              <Icon name="open" />
              Open…
            </Btn>
          </div>
          {filtered.length === 0 ? (
            <div className="q-start-empty">{recent.length === 0 ? 'Documents you open or save will appear here.' : 'No documents match your search.'}</div>
          ) : view === 'list' ? (
            <div className="q-filelist-wrap">
              <table className="q-filelist">
                <thead>
                  <tr>
                    <th style={{ width: '46%' }}>Name</th>
                    <th>Location</th>
                    <th>Last edited</th>
                    <th style={{ width: 80 }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr
                      key={f.path}
                      tabIndex={0}
                      onClick={() => onOpenPath(f.path)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onOpenPath(f.path)
                        if (e.key === 'Backspace' || e.key === 'Delete') void remove(f.path)
                      }}
                      title={f.path}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span className="q-fileico" />
                          <span style={{ fontWeight: 500 }}>{f.name}</span>
                        </div>
                      </td>
                      <td className="sub">{f.dir}</td>
                      <td className="sub">{formatEdited(f.modified)}</td>
                      <td>
                        <span className="q-badge docx">docx</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="q-cards">
              {filtered.map((f) => (
                <a
                  key={f.path}
                  href="#"
                  className="q-card"
                  title={f.path}
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenPath(f.path)
                  }}
                >
                  <div className="q-card-thumb" style={{ height: 200 }}>
                    <div className="q-thumb-page">
                      {thumbLines('h78 50 g 100 100 92 64 g h40 100 88').map((l, i) => (
                        <div key={i} className={l.cls} style={{ width: l.w }} />
                      ))}
                    </div>
                  </div>
                  <div className="q-card-meta">
                    <div className="q-card-name">{f.name}</div>
                    <div className="q-card-sub">
                      <span className="q-badge docx">docx</span>
                      <span>{formatEdited(f.modified)}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
