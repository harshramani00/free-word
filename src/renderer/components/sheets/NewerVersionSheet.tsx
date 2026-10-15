import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { OpenedDocument } from '../../../shared/types'
import { relativeTime } from '../../state/cloudStore'
import { Avatar } from '../cloud/CloudGlyph'
import { Btn } from '../controls'
import { Icon } from '../icons'

/**
 * The only modal sync question Quill asks: on open, when the cloud is ahead of the
 * local copy. Keep Mine opens the local file (the next save becomes newest);
 * Fetch replaces the local file with the cloud's newest version.
 */
export function NewerVersionSheet({ doc, onKeepMine, onFetch, onHistory }: { doc: OpenedDocument; onKeepMine: () => void; onFetch: () => void; onHistory: () => void }): ReactNode {
  const newer = doc.cloudNewer!.newer
  const by = newer.updatedBy === 'claude' ? 'Claude' : 'You'
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onKeepMine()
      if (e.key === 'Enter') onFetch()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onKeepMine, onFetch])
  return (
    <>
      <div className="q-scrim" style={{ top: 'var(--q-titlebar-h)' }} />
      <section className="q-sheet" role="dialog" aria-labelledby="q-newer-title" aria-describedby="q-newer-desc" style={{ top: 'var(--q-titlebar-h)', width: 480 }}>
        <div className="q-sheet-body" style={{ flexDirection: 'row', gap: 18, alignItems: 'flex-start' }}>
          <span className="q-sheet-ico">
            <Icon name="cloud-down" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
            <h2 className="q-sheet-title" id="q-newer-title">
              A newer version is on the cloud
            </h2>
            <p className="q-sheet-text" id="q-newer-desc">
              {by} saved version {newer.n} of “{doc.name}” {relativeTime(newer.createdAt)}
              {newer.updatedBy === 'claude' ? ', while this Mac was not looking' : ' on another Mac'}. Fetch that version, or keep the copy on this Mac. Your next save becomes the newest version either way, and nothing is deleted.
            </p>
            {newer.note ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--q-radius-md)', background: 'var(--q-fill-subtle)', marginTop: 4 }}>
                <Avatar name={by} size={22} />
                <span style={{ font: 'var(--q-type-callout)', lineHeight: '17px' }}>“{newer.note}”</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="q-sheet-foot" style={{ justifyContent: 'space-between' }}>
          <a
            href="#"
            style={{ font: 'var(--q-type-callout)', color: 'var(--q-accent-text)', textDecoration: 'none', alignSelf: 'center' }}
            onClick={(e) => {
              e.preventDefault()
              onHistory()
            }}
          >
            Version history
          </a>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn onClick={onKeepMine} style={{ height: 30, padding: '0 14px' }}>
              Keep Mine
            </Btn>
            <Btn primary autoFocus onClick={onFetch} style={{ height: 30, padding: '0 14px' }}>
              Fetch Newer Version
            </Btn>
          </div>
        </div>
      </section>
    </>
  )
}
