import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { CloudRow } from '../../../shared/cloud'
import type { JSONContent, RecentEntry } from '../../../shared/types'
import { isNewFromClaude, relativeTime, statusLabel, useCloud } from '../../state/cloudStore'
import { loadPrefs, savePrefs } from '../../state/prefs'
import { Avatar, ClaudeTag, CloudGlyph } from '../cloud/CloudGlyph'
import { Btn, Seg, SearchField, TBtn } from '../controls'
import { Icon } from '../icons'
import type { IconName } from '../icons'
import { Anchor, Menu, MenuItem, MenuSep, usePopover } from '../popovers/Menu'
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

type RailView = 'home' | 'cloud' | 'local'

function RailLink({ icon, label, current, disabled, onClick }: { icon: IconName; label: string; current?: boolean; disabled?: boolean; onClick?: () => void }): ReactNode {
  return (
    <a
      href="#"
      className={['q-outline', 'l1', current ? 'is-current' : '', disabled ? 'q-rail-link is-disabled' : ''].filter(Boolean).join(' ')}
      style={{ gap: 8, paddingLeft: 8, fontWeight: current ? undefined : 400 }}
      aria-disabled={disabled || undefined}
      aria-current={current ? 'page' : undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={(e) => {
        e.preventDefault()
        if (!disabled) onClick?.()
      }}
    >
      <Icon name={icon} />
      {label}
    </a>
  )
}

export interface StartScreenProps {
  onNew: (content: JSONContent) => void
  onOpen: () => void
  onOpenPath: (path: string) => void
  onOpenRow: (row: CloudRow) => void
  onTurnOnCloud: () => void
  onSettings: () => void
}

export function StartScreen({ onNew, onOpen, onOpenPath, onOpenRow, onTurnOnCloud, onSettings }: StartScreenProps): ReactNode {
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'grid'>(() => loadPrefs().startView)
  const [rail, setRail] = useState<RailView>('home')
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const { cloud, rows } = useCloud((u) => ({ cloud: u.state, rows: u.rows }))
  const cloudOn = cloud.enabled && cloud.account !== null
  const menu = usePopover()
  const [menuRow, setMenuRow] = useState<CloudRow | null>(null)

  useEffect(() => {
    let alive = true
    void window.quill.recentList().then((list) => {
      if (alive) setRecent(list)
    })
    // Downloads and removals change what counts as "on this Mac".
    return () => {
      alive = false
    }
  }, [rows])

  const q = query.trim().toLowerCase()
  const trackedPaths = useMemo(() => new Set(rows.map((r) => r.localPath).filter((p): p is string => !!p)), [rows])
  const filteredRecent = useMemo(() => recent.filter((r) => r.name.toLowerCase().includes(q)), [recent, q])
  const localRows = useMemo(() => (cloudOn ? filteredRecent.filter((r) => !trackedPaths.has(r.path)) : filteredRecent), [cloudOn, filteredRecent, trackedPaths])
  const cloudRows = useMemo(() => rows.filter((r) => r.name.toLowerCase().includes(q)), [rows, q])

  const changeView = (v: 'list' | 'grid'): void => {
    setView(v)
    savePrefs({ ...loadPrefs(), startView: v })
  }
  const remove = async (path: string): Promise<void> => setRecent(await window.quill.recentRemove(path))

  const act = async (row: CloudRow, fn: () => Promise<unknown>): Promise<void> => {
    setBusyRow(row.id)
    try {
      await fn()
    } catch (err) {
      console.error(err)
    } finally {
      setBusyRow(null)
    }
  }
  const upload = (path: string): Promise<void> => window.quill.cloudUpload(path).then(() => undefined)

  const primaryAction = (row: CloudRow): { label: string; run: () => Promise<void> } => {
    switch (row.status) {
      case 'cloud-only':
        return { label: 'Download', run: () => window.quill.cloudDownload(row.id).then(() => undefined) }
      case 'newer-on-cloud':
        return { label: 'Fetch', run: () => window.quill.cloudDownload(row.id).then(() => undefined) }
      case 'pending-upload':
        return { label: 'Retry', run: () => window.quill.cloudRefresh() }
      default:
        return { label: 'Open', run: async () => onOpenRow(row) }
    }
  }

  const syncPill = (): ReactNode => {
    if (!cloudOn) return null
    if (!cloud.online) return <span className="q-sync is-offline"><Icon name="cloud-off" />Offline · will sync when connected</span>
    if (cloud.pendingUploads > 0) return <span className="q-sync"><Icon name="cloud-up" />Uploading {cloud.pendingUploads}…</span>
    return <span className="q-sync"><Icon name="cloud-check" />Synced · {cloud.lastSyncAt ? relativeTime(cloud.lastSyncAt) : 'just now'}</span>
  }

  const showCloud = cloudOn && rail !== 'local'
  const showLocal = rail !== 'cloud'

  const recentTable = (list: RecentEntry[], withUpload: boolean): ReactNode => (
    <div className="q-filelist-wrap">
      <table className="q-filelist">
        <thead>
          <tr>
            <th style={{ width: '42%' }}>Name</th>
            <th>Location</th>
            <th>Last edited</th>
            <th className="act" style={withUpload ? undefined : { width: 80 }}>{withUpload ? '' : 'Type'}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((f) => (
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {withUpload ? <CloudGlyph status="local-only" /> : null}
                  <span className="q-fileico" />
                  <span style={{ fontWeight: 500 }}>{f.name}</span>
                </div>
              </td>
              <td className="sub">{f.dir}</td>
              <td className="sub">{formatEdited(f.modified)}</td>
              <td className={withUpload ? 'act' : undefined} onClick={withUpload ? (e) => e.stopPropagation() : undefined}>
                {withUpload ? (
                  <Btn
                    className="sm"
                    onClick={() => {
                      void upload(f.path)
                    }}
                  >
                    <Icon name="cloud-up" style={{ width: 13, height: 13 }} />
                    Upload to Cloud
                  </Btn>
                ) : (
                  <span className="q-badge docx">docx</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="q-start" onClick={(e) => e.stopPropagation()}>
      <nav className="q-sidebar q-start-rail" aria-label="Start">
        <Btn primary style={{ height: 32, width: '100%' }} onClick={() => onNew(BLANK)}>
          <Icon name="new-document" />
          New Document
        </Btn>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <RailLink icon="home" label="Home" current={rail === 'home'} onClick={() => setRail('home')} />
          {cloudOn ? (
            <>
              <RailLink icon="cloud" label="Cloud" current={rail === 'cloud'} onClick={() => setRail('cloud')} />
              <RailLink icon="laptop" label="On this Mac" current={rail === 'local'} onClick={() => setRail('local')} />
            </>
          ) : null}
          <RailLink icon="templates" label="Templates" disabled />
          {cloudOn ? null : <RailLink icon="pinned" label="Pinned" disabled />}
          <RailLink icon="open" label="Open…" onClick={onOpen} />
        </div>
        <div className="q-rail-cloud">
          {cloudOn && cloud.account ? (
            <a
              href="#"
              className="q-account"
              aria-label={`Cloud settings for ${cloud.account.name}`}
              onClick={(e) => {
                e.preventDefault()
                onSettings()
              }}
            >
              <Avatar name={cloud.account.name} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="q-account-name">{cloud.account.name}</span>
                <span className="q-account-sub" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className={`q-dot${cloud.online ? '' : ' off'}`} style={{ width: 6, height: 6, boxShadow: 'none' }} />
                  {cloud.online ? `Cloud on · Synced ${cloud.lastSyncAt ? relativeTime(cloud.lastSyncAt) : 'just now'}` : 'Cloud on · Offline'}
                </span>
              </span>
              <Icon name="gear" style={{ color: 'var(--q-text-tertiary)' }} />
            </a>
          ) : (
            <RailLink icon="cloud" label={cloud.enabled && !cloud.account ? 'Sign in to Cloud…' : 'Turn on Cloud…'} onClick={onTurnOnCloud} />
          )}
        </div>
      </nav>

      <main className="q-start-main">
        {rail === 'home' ? (
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
        ) : null}

        {showCloud ? (
          <section className={`q-start-section${rail === 'cloud' ? ' grow' : ''}`} style={{ gap: 10, minHeight: 0 }}>
            <div className="q-start-head">
              <h2>Cloud</h2>
              {syncPill()}
              <span className="q-fill" />
              <SearchField value={query} onChange={setQuery} placeholder="Search" label="Search documents" style={{ width: 240 }} />
              <Btn onClick={onOpen}>
                <Icon name="open" />
                Open…
              </Btn>
            </div>
            {cloudRows.length === 0 ? (
              <div className="q-start-empty">{rows.length === 0 ? 'Nothing on your cloud yet. Upload a document from “On this Mac”, or ask Claude to create one.' : 'No documents match your search.'}</div>
            ) : (
              <div className="q-filelist-wrap">
                <table className="q-filelist">
                  <thead>
                    <tr>
                      <th style={{ width: '42%' }}>Name</th>
                      <th>Status</th>
                      <th>Last edited</th>
                      <th className="act"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cloudRows.map((row) => {
                      const primary = primaryAction(row)
                      return (
                        <tr
                          key={row.id}
                          tabIndex={0}
                          onClick={() => void onOpenRow(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void onOpenRow(row)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            setMenuRow(row)
                            menu.setOpen(true)
                          }}
                          title={row.localPath ?? `${row.path ? row.path + '/' : ''}${row.name}.docx`}
                        >
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <CloudGlyph status={row.status} />
                              <span className="q-fileico" />
                              <span style={{ fontWeight: 500 }}>{row.name}</span>
                              {isNewFromClaude(row) ? <ClaudeTag /> : null}
                            </div>
                          </td>
                          <td className="sub">{statusLabel(row)}</td>
                          <td className="sub">
                            {row.updatedBy === 'claude' ? 'Claude · ' : ''}
                            {formatEdited(row.updatedAt)}
                          </td>
                          <td className="act" onClick={(e) => e.stopPropagation()}>
                            <div className="q-row-actions">
                              {row.status !== 'synced' ? (
                                <Btn className="sm" onClick={() => void onOpenRow(row)}>
                                  Open
                                </Btn>
                              ) : null}
                              {row.status !== 'synced' ? (
                                <Btn className="sm" primary disabled={busyRow === row.id} onClick={() => void act(row, primary.run)}>
                                  {busyRow === row.id ? '…' : primary.label}
                                </Btn>
                              ) : (
                                <Btn className="sm" primary onClick={() => void onOpenRow(row)}>
                                  Open
                                </Btn>
                              )}
                              {menuRow?.id === row.id ? (
                                <Anchor pop={menu}>
                                  <TBtn label="More" icon="more" small pressed={menu.open} ariaHasPopup ariaExpanded={menu.open} onClick={() => menu.toggle()} />
                                </Anchor>
                              ) : (
                                <TBtn
                                  label="More"
                                  icon="more"
                                  small
                                  ariaHasPopup
                                  onClick={() => {
                                    setMenuRow(row)
                                    menu.setOpen(true)
                                  }}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {showLocal ? (
          <section className="q-start-section grow">
            <div className="q-start-head">
              <h2 style={cloudOn ? undefined : { flex: 1 }}>{cloudOn ? 'On this Mac' : 'Recent'}</h2>
              {cloudOn ? <span className="q-section-sub">Files outside your cloud. They stay here unless you upload them.</span> : null}
              {cloudOn ? <span className="q-fill" /> : null}
              {!cloudOn || rail === 'local' ? <SearchField value={query} onChange={setQuery} placeholder="Search" label="Search recent documents" style={{ width: 240 }} /> : null}
              {!cloudOn ? (
                <>
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
                </>
              ) : null}
            </div>
            {localRows.length === 0 ? (
              <div className="q-start-empty">{recent.length === 0 ? 'Documents you open or save will appear here.' : cloudOn && q === '' ? 'Every recent document is on your cloud.' : 'No documents match your search.'}</div>
            ) : view === 'list' || cloudOn ? (
              recentTable(localRows, cloudOn)
            ) : (
              <div className="q-cards">
                {localRows.map((f) => (
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
        ) : null}
      </main>

      {menuRow && menu.open ? (
        <Menu pop={menu} label={`Actions for ${menuRow.name}`} placement="below">
          <MenuItem onSelect={() => void onOpenRow(menuRow)}>Open</MenuItem>
          {menuRow.status === 'cloud-only' ? <MenuItem onSelect={() => void act(menuRow, () => window.quill.cloudDownload(menuRow.id))}>Download</MenuItem> : null}
          {menuRow.status === 'newer-on-cloud' ? <MenuItem onSelect={() => void act(menuRow, () => window.quill.cloudDownload(menuRow.id))}>Fetch Newer Version</MenuItem> : null}
          <MenuSep />
          {menuRow.localPath ? <MenuItem onSelect={() => window.quill.revealPath(menuRow.localPath!)}>Show in Finder</MenuItem> : null}
          {menuRow.localPath ? <MenuItem onSelect={() => void act(menuRow, () => window.quill.cloudRemoveDownload(menuRow.id))}>Remove Download</MenuItem> : null}
          <MenuItem onSelect={() => void act(menuRow, () => window.quill.cloudStopSyncing(menuRow.id))}>Stop Syncing</MenuItem>
        </Menu>
      ) : null}
    </div>
  )
}
