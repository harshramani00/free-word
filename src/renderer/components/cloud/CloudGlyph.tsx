import type { ReactNode } from 'react'
import type { CloudRow, LocalSyncStatus } from '../../../shared/cloud'
import { Icon } from '../icons'
import type { IconName } from '../icons'

const GLYPH: Record<LocalSyncStatus, { icon: IconName; cls: string }> = {
  'cloud-only': { icon: 'cloud', cls: 'is-new' },
  synced: { icon: 'cloud-check', cls: 'is-synced' },
  'newer-on-cloud': { icon: 'cloud-down', cls: '' },
  'pending-upload': { icon: 'cloud-up', cls: 'is-pending' },
  'local-only': { icon: 'laptop', cls: 'is-local' }
}

/** The 16px status glyph that leads every row in the Cloud and On this Mac lists. */
export function CloudGlyph({ status, title }: { status: LocalSyncStatus; title?: string }): ReactNode {
  const g = GLYPH[status]
  return (
    <span className={['q-stat', g.cls].filter(Boolean).join(' ')} title={title} aria-hidden={title ? undefined : true}>
      <Icon name={g.icon} />
    </span>
  )
}

export function ClaudeTag({ children = 'New from Claude' }: { children?: ReactNode }): ReactNode {
  return (
    <span className="q-tag claude">
      <Icon name="sparkle" />
      {children}
    </span>
  )
}

export function Avatar({ name, size, className }: { name: string; size?: number; className?: string }): ReactNode {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className={['q-avatar', className].filter(Boolean).join(' ')} style={size ? { width: size, height: size, fontSize: Math.round(size * 0.38) } : undefined} aria-hidden="true">
      {initials || '?'}
    </span>
  )
}

export const byLabel = (row: Pick<CloudRow, 'updatedBy'>): string => (row.updatedBy === 'claude' ? 'Claude' : 'You')
