import type { ReactNode } from 'react'
import type { ToolbarMode } from '../../state/prefs'
import { Seg, SearchField, TBtn } from '../controls'
import { Icon } from '../icons'

export function EditorTitleBar({
  name,
  dirty,
  canUndo,
  canRedo,
  toolbarMode,
  search,
  exportOpen,
  onSave,
  onUndo,
  onRedo,
  onToolbarMode,
  onSearch,
  onFindNext,
  onExport,
  searchRef
}: {
  name: string
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
  toolbarMode: ToolbarMode
  search: string
  exportOpen: boolean
  onSave: () => void
  onUndo: () => void
  onRedo: () => void
  onToolbarMode: (m: ToolbarMode) => void
  onSearch: (q: string) => void
  onFindNext: (backwards: boolean) => void
  onExport: () => void
  searchRef?: (el: HTMLLabelElement | null) => void
}): ReactNode {
  return (
    <div className="q-titlebar">
      <TBtn label="Save" icon="save" onClick={onSave} />
      <TBtn label="Undo" icon="undo" disabled={!canUndo} onClick={onUndo} />
      <TBtn label="Redo" icon="redo" disabled={!canRedo} onClick={onRedo} />
      <div className="q-titlebar-center">
        <span style={{ font: 'var(--q-type-headline)' }}>{name}</span>
        {dirty ? <span className="edited">— Edited</span> : null}
      </div>
      <span className="q-fill" />
      <Seg<ToolbarMode>
        label="Toolbar mode"
        value={toolbarMode}
        onChange={onToolbarMode}
        options={[
          { value: 'simple', label: 'Simple' },
          { value: 'full', label: 'Full' }
        ]}
        style={{ marginRight: 10 }}
      />
      <label className="q-search" style={{ width: 220, marginRight: 6 }} ref={searchRef}>
        <Icon name="search" />
        <span className="q-sr">Search in document</span>
        <input
          type="text"
          placeholder="Search in document"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFindNext(e.shiftKey)
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
      <TBtn label="Export" icon="export" text="Export" pressed={exportOpen} onClick={onExport} />
    </div>
  )
}

export function StartTitleBar(): ReactNode {
  return (
    <div className="q-titlebar is-start">
      <div className="q-titlebar-center">
        <span style={{ font: 'var(--q-type-headline)' }}>Quill</span>
      </div>
    </div>
  )
}

export { SearchField }
