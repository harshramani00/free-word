import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { DESKTOP_CLIENT_ID } from '../../../shared/cloud'
import { relativeTime, useCloud } from '../../state/cloudStore'
import { Avatar } from '../cloud/CloudGlyph'
import { Btn } from '../controls'
import { Icon } from '../icons'

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

export function CloudSettingsSheet({ onDone, onSetUp }: { onDone: () => void; onSetUp: () => void }): ReactNode {
  const { state, rows } = useCloud((u) => ({ state: u.state, rows: u.rows }))
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<'signout' | 'disconnect' | null>(null)
  const account = state.account

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDone()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDone])

  const run = async (key: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(key)
    try {
      await fn()
    } finally {
      setBusy(null)
    }
  }

  const downloaded = rows.filter((r) => r.localPath).length
  const claude = account?.connectedApps.find((a) => /claude/i.test(a.clientName)) ?? null
  // Quill's own sign-ins are not "connected apps"; signing out handles those.
  const otherApps = account?.connectedApps.filter((a) => a !== claude && a.clientId !== DESKTOP_CLIENT_ID) ?? []

  return (
    <>
      <div className="q-scrim" style={{ top: 'var(--q-titlebar-h)' }} onClick={onDone} />
      <section className="q-sheet is-settings" role="dialog" aria-labelledby="q-cloud-settings-title" style={{ top: 'var(--q-titlebar-h)', width: 640 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 6px' }}>
          <span className="q-sheet-ico" style={{ width: 40, height: 40, borderRadius: 12 }}>
            <Icon name="cloud" style={{ width: 22, height: 22 }} />
          </span>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 className="q-sheet-title" id="q-cloud-settings-title">
              Cloud
            </h2>
            <span className="q-section-sub">Your documents on your own server, and Claude’s access to them.</span>
          </div>
          <button type="button" className="q-toggle" role="switch" aria-checked={state.enabled} aria-label={state.enabled ? 'Cloud on' : 'Cloud off'} disabled={!account} onClick={() => void run('toggle', () => window.quill.cloudSetEnabled(!state.enabled))} />
        </div>

        <div className="q-sheet-body" style={{ gap: 18, paddingTop: 16 }}>
          {!account ? (
            <div className="q-setgroup">
              <div className="q-setrow">
                <div className="q-setrow-main">
                  <span className="lbl">Cloud is off</span>
                  <span className="sub" style={{ whiteSpace: 'normal' }}>
                    Quill works entirely on this Mac. Turn Cloud on to keep documents on your own server and let Claude work on them.
                  </span>
                </div>
                <Btn primary onClick={onSetUp}>
                  Turn on Cloud…
                </Btn>
              </div>
            </div>
          ) : (
            <>
              <div>
                <div className="q-setgroup-title">Account</div>
                <div className="q-setgroup">
                  <div className="q-setrow">
                    <Avatar name={account.name} className="lg" />
                    <div className="q-setrow-main">
                      <span className="lbl">{account.name}</span>
                      <span className="sub">
                        {account.email} · {account.serverUrl.replace(/^https?:\/\//, '')}
                      </span>
                    </div>
                    {confirm === 'signout' ? (
                      <>
                        <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
                        <Btn
                          primary
                          disabled={busy === 'signout'}
                          onClick={() =>
                            void run('signout', async () => {
                              await window.quill.cloudSignOut()
                              setConfirm(null)
                              onDone()
                            })
                          }
                        >
                          Sign Out
                        </Btn>
                      </>
                    ) : (
                      <Btn onClick={() => setConfirm('signout')}>Sign Out</Btn>
                    )}
                  </div>
                  {confirm === 'signout' ? (
                    <div className="q-setrow" style={{ minHeight: 0, paddingTop: 0 }}>
                      <span className="sub" style={{ whiteSpace: 'normal' }}>
                        Signing out keeps every file on this Mac. Quill forgets which ones are synced; sign in again to reconnect them.
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div>
                <div className="q-setgroup-title">Sync</div>
                <div className="q-setgroup">
                  <div className="q-setrow">
                    <Icon name="open" style={{ width: 20, height: 20, color: 'var(--q-text-secondary)' }} />
                    <div className="q-setrow-main">
                      <span className="lbl">Quill folder</span>
                      <span className="sub">{account.folder.replace(/^\/Users\/[^/]+/, '~')} · downloads land here, uploads come from here</span>
                    </div>
                    <Btn disabled={busy === 'folder'} onClick={() => void run('folder', () => window.quill.cloudChooseFolder())}>
                      Change…
                    </Btn>
                  </div>
                  <div className="q-setrow">
                    <Icon name="laptop" style={{ width: 20, height: 20, color: 'var(--q-text-secondary)' }} />
                    <div className="q-setrow-main">
                      <span className="lbl">Kept on this Mac</span>
                      <span className="sub">
                        {downloaded} of {rows.length} cloud {rows.length === 1 ? 'document is' : 'documents are'} downloaded
                        {state.pendingUploads ? ` · ${state.pendingUploads} waiting to upload` : ''}
                      </span>
                    </div>
                    <Btn onClick={onDone}>Manage…</Btn>
                  </div>
                  <div className="q-setrow" style={{ alignItems: 'flex-start' }}>
                    <Icon name="versions" style={{ width: 20, height: 20, color: 'var(--q-text-secondary)', marginTop: 2 }} />
                    <div className="q-setrow-main" style={{ gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span className="lbl">Storage on your cloud</span>
                        <span className="sub">
                          {formatBytes(account.usedBytes)} of {formatBytes(account.quotaBytes)}
                        </span>
                      </div>
                      <div className="q-meter">
                        <span style={{ width: `${Math.min(100, Math.round((account.usedBytes / Math.max(1, account.quotaBytes)) * 100))}%` }} />
                      </div>
                      <span className="sub" style={{ whiteSpace: 'normal' }}>
                        Every save is kept as a version. The last 30 versions of each document count toward this.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="q-setgroup-title">Claude</div>
                <div className="q-setgroup">
                  <div className="q-setrow">
                    <Avatar name="Claude" size={32} />
                    <div className="q-setrow-main">
                      <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        Claude
                        <span className={`q-tag ${claude ? 'claude' : 'neutral'}`}>{claude ? 'Connected' : 'Not connected'}</span>
                      </span>
                      <span className="sub">
                        {claude ? `Can read, create and edit your cloud documents · last used ${claude.lastUsedAt ? relativeTime(claude.lastUsedAt) : 'never'}` : 'Add the connector address below in Claude to connect.'}
                      </span>
                    </div>
                    {claude ? (
                      confirm === 'disconnect' ? (
                        <>
                          <Btn onClick={() => setConfirm(null)}>Cancel</Btn>
                          <Btn
                            primary
                            disabled={busy === 'disconnect'}
                            onClick={() =>
                              void run('disconnect', async () => {
                                await window.quill.cloudDisconnectApp(claude.id)
                                setConfirm(null)
                              })
                            }
                          >
                            Disconnect
                          </Btn>
                        </>
                      ) : (
                        <Btn onClick={() => setConfirm('disconnect')}>Disconnect</Btn>
                      )
                    ) : null}
                  </div>
                  {confirm === 'disconnect' ? (
                    <div className="q-setrow" style={{ minHeight: 0, paddingTop: 0 }}>
                      <span className="sub" style={{ whiteSpace: 'normal' }}>
                        Claude will no longer be able to read or edit your documents. Nothing it already wrote is removed.
                      </span>
                    </div>
                  ) : null}
                  <div className="q-setrow">
                    <span style={{ width: 32, flex: 'none' }} />
                    <div className="q-setrow-main">
                      <span className="lbl">Connector address</span>
                      <span className="sub">Paste into Claude › Settings › Connectors on any device.</span>
                    </div>
                    <span className="q-pathbox" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {state.connectorUrl}
                    </span>
                    <Btn
                      onClick={() => {
                        if (!state.connectorUrl) return
                        void navigator.clipboard.writeText(state.connectorUrl).then(() => {
                          setCopied(true)
                          setTimeout(() => setCopied(false), 1500)
                        })
                      }}
                    >
                      <Icon name="copy" />
                      {copied ? 'Copied' : 'Copy'}
                    </Btn>
                  </div>
                  {otherApps.map((a) => (
                    <div className="q-setrow" key={a.id}>
                      <Avatar name={a.clientName} size={32} />
                      <div className="q-setrow-main">
                        <span className="lbl">{a.clientName}</span>
                        <span className="sub">Connected {relativeTime(a.createdAt)}</span>
                      </div>
                      <Btn disabled={busy === a.id} onClick={() => void run(a.id, () => window.quill.cloudDisconnectApp(a.id))}>
                        Disconnect
                      </Btn>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="q-setgroup-title">Server</div>
                <div className="q-setgroup">
                  <div className="q-setrow">
                    <span className={`q-dot${state.online ? '' : ' off'}`} style={{ margin: '0 6px' }} />
                    <div className="q-setrow-main">
                      <span className="lbl">{account.serverUrl.replace(/^https?:\/\//, '')}</span>
                      <span className="sub">{state.online ? `Online · last synced ${state.lastSyncAt ? relativeTime(state.lastSyncAt) : 'just now'}` : 'Unreachable · Quill keeps working; sync resumes on its own'}</span>
                    </div>
                    <Btn disabled={busy === 'refresh'} onClick={() => void run('refresh', () => window.quill.cloudRefresh())}>
                      Check now
                    </Btn>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="q-sheet-foot" style={{ paddingTop: 4 }}>
          <Btn primary onClick={onDone} style={{ height: 30, padding: '0 18px' }}>
            Done
          </Btn>
        </div>
      </section>
    </>
  )
}
