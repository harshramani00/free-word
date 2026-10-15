import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { CloudRow, VersionInfo } from '../../../shared/cloud'
import { relativeTime } from '../../state/cloudStore'
import { Btn } from '../controls'

/**
 * The version list for the open document, floating above the status bar. Fetch pulls
 * the cloud's newest; Restore makes an older version the newest and opens it.
 */
export function VersionHistory({ row, docName, onClose, onFetch, onRestore }: { row: CloudRow | null; docName: string; onClose: () => void; onFetch: (n: number) => void; onRestore: (n: number) => void }): ReactNode {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!row) return
    let alive = true
    window.quill
      .cloudVersions(row.id)
      .then((v) => alive && setVersions(v))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      alive = false
    }
  }, [row?.id, row?.currentVersion])

  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const localVersion = row?.localVersion ?? null
  const newest = row?.currentVersion ?? 0

  return (
    <div className="q-versions q-float" ref={ref} role="dialog" aria-label="Version history">
      <div className="q-versions-head">
        <h3>Version history</h3>
        <span style={{ font: 'var(--q-type-caption)', color: 'var(--q-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{docName}</span>
      </div>
      {!row ? (
        <div className="q-version">
          <div className="v-main">
            <span className="v-sub">This document is not on the cloud yet.</span>
          </div>
        </div>
      ) : error ? (
        <div className="q-version">
          <div className="v-main">
            <span className="v-sub">Could not load versions: {error}</span>
          </div>
        </div>
      ) : !versions ? (
        <div className="q-version">
          <div className="v-main">
            <span className="v-sub">Loading…</span>
          </div>
        </div>
      ) : (
        versions.map((v) => {
          const isNewest = v.n === newest
          const isLocal = v.n === localVersion
          return (
            <div className={`q-version${isNewest && !isLocal ? ' is-current' : ''}`} key={v.n}>
              <span className={`who${v.updatedBy === 'claude' ? ' claude' : ''}`}>{v.updatedBy === 'claude' ? 'C' : 'You'}</span>
              <div className="v-main">
                <span className="v-title">
                  Version {v.n}
                  {isNewest ? <span className="q-tag claude">On cloud</span> : null}
                  {isLocal ? <span className="q-tag neutral">On this Mac</span> : null}
                </span>
                <span className="v-sub">
                  {v.updatedBy === 'claude' ? 'Claude' : 'You'} · {new Date(v.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {relativeTime(v.createdAt)}
                </span>
                {v.note ? <span className="v-note">{v.note}</span> : null}
              </div>
              {isNewest && !isLocal ? (
                <Btn className="sm" style={{ height: 24, padding: '0 10px', font: 'var(--q-type-callout)' }} onClick={() => onFetch(v.n)}>
                  Fetch
                </Btn>
              ) : !isNewest ? (
                <Btn className="sm" style={{ height: 24, padding: '0 10px', font: 'var(--q-type-callout)' }} onClick={() => onRestore(v.n)}>
                  Restore
                </Btn>
              ) : null}
            </div>
          )
        })
      )}
      <div className="q-versions-foot">
        <span>The last 30 versions are kept on your cloud.</span>
      </div>
    </div>
  )
}
