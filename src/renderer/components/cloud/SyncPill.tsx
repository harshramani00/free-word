import type { ReactNode } from 'react'
import { fetchNewerForOpenDocument, uploadOpenDocument } from '../../state/actions'
import { relativeTime, useCloud } from '../../state/cloudStore'
import { setState, useDocState } from '../../state/documentStore'
import { Icon } from '../icons'
import type { IconName } from '../icons'

/**
 * The status-bar pill. Quiet while everything is in order; lit (accent) when the cloud
 * holds a newer version than the open document. Clicking it opens version history,
 * or fetches when the cloud is ahead.
 */
export function SyncPill(): ReactNode {
  const { cloudDocId, path } = useDocState((s) => ({ cloudDocId: s.cloudDocId, path: s.path }))
  const { state, row } = useCloud((u) => ({ state: u.state, row: cloudDocId ? u.rows.find((r) => r.id === cloudDocId) ?? null : null }))
  if (!state.enabled || !state.account) return null

  let icon: IconName = 'cloud-check'
  let text: string
  let attention = false
  let onClick: () => void = () => setState({ historyOpen: true })

  if (!cloudDocId) {
    if (!path) return null
    icon = 'cloud-up'
    text = 'Not on cloud · Upload'
    onClick = () => void uploadOpenDocument()
  } else if (!state.online) {
    icon = 'cloud-off'
    text = 'Offline · will sync when connected'
  } else if (!row) {
    icon = 'cloud'
    text = 'Saved to cloud'
  } else if (row.status === 'newer-on-cloud') {
    icon = 'cloud-down'
    attention = true
    text = `Newer version on cloud · ${row.updatedBy === 'claude' ? 'Claude' : 'another Mac'}, ${relativeTime(row.updatedAt)}`
    onClick = () => void fetchNewerForOpenDocument()
  } else if (row.status === 'pending-upload') {
    icon = 'cloud-up'
    text = 'Uploading…'
  } else {
    text = `Saved to cloud · ${relativeTime(row.updatedAt)}`
  }

  return (
    <button type="button" className={`q-sync is-button${attention ? ' is-attention' : ''}`} onClick={onClick} title={attention ? 'Fetch the newer version' : 'Version history'}>
      <Icon name={icon} />
      {text}
    </button>
  )
}
