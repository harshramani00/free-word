import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Btn } from '../controls'
import { Icon } from '../icons'

export function UnsavedSheet({ name, onSave, onDiscard, onCancel }: { name: string; onSave: () => void; onDiscard: () => void; onCancel: () => void }): ReactNode {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onSave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, onSave])
  return (
    <>
      <div className="q-scrim" style={{ top: 'var(--q-titlebar-h)' }} />
      <section className="q-sheet" role="alertdialog" aria-label="Save changes" aria-describedby="q-unsaved-desc" style={{ top: 'var(--q-titlebar-h)', width: 448, padding: '22px 22px 20px', display: 'flex', gap: 18 }}>
        <div
          style={{
            width: 56,
            height: 56,
            flex: 'none',
            borderRadius: 13,
            background: 'var(--q-bg-page)',
            boxShadow: '0 0 0 0.5px var(--q-border-control), 0 1px 3px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--q-accent)'
          }}
        >
          <Icon name="doc-large" style={{ width: 28, height: 28, strokeWidth: 1.2 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ font: 'var(--q-type-headline)' }}>Do you want to save changes to “{name}”?</h2>
          <p id="q-unsaved-desc" style={{ margin: 0, font: 'var(--q-type-callout)', color: 'var(--q-text-secondary)' }}>
            Your changes will be lost if you don’t save them.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <Btn onClick={onDiscard}>Don’t Save</Btn>
            <span className="q-fill" />
            <Btn onClick={onCancel}>Cancel</Btn>
            <Btn primary autoFocus onClick={onSave}>
              Save
            </Btn>
          </div>
        </div>
      </section>
    </>
  )
}
