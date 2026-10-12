import type { ReactNode } from 'react'
import type { RibbonTab } from '../../state/documentStore'

const TABS: { id: RibbonTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' }
]

export function Tabs({ active, inTable, onSelect }: { active: RibbonTab; inTable: boolean; onSelect: (t: RibbonTab) => void }): ReactNode {
  return (
    <div className="q-tabs" role="tablist" aria-label="Toolbar">
      {TABS.map((t) => (
        <button key={t.id} type="button" className={['q-tab', active === t.id ? 'is-active' : ''].join(' ')} role="tab" aria-selected={active === t.id} onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect(t.id)}>
          {t.label}
        </button>
      ))}
      {inTable ? (
        <>
          <span className="q-tabs-sep" />
          <button type="button" className={['q-tab', 'is-context', active === 'table' ? 'is-active' : ''].join(' ')} role="tab" aria-selected={active === 'table'} onMouseDown={(e) => e.preventDefault()} onClick={() => onSelect('table')}>
            Table
          </button>
        </>
      ) : null}
    </div>
  )
}
