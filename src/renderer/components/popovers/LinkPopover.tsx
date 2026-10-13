import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Btn } from '../controls'
import { Menu } from './Menu'
import type { PopoverState } from './Menu'

export function LinkPopover({ pop, initial, onApply, onRemove, onClose }: { pop: PopoverState; initial: string; onApply: (href: string) => void; onRemove: () => void; onClose: () => void }): ReactNode {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <Menu pop={pop} role="dialog" label="Link" className="q-linkpop" style={{ minWidth: 0 }}>
      <label className="q-form-label" htmlFor="q-link-url" style={{ textAlign: 'left' }}>
        Link to
      </label>
      <div className="row">
        <input
          id="q-link-url"
          ref={ref}
          className="q-field"
          type="url"
          placeholder="https://"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onApply(value)
            }
            if (e.key === 'Escape') onClose()
          }}
        />
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        {initial ? (
          <Btn onClick={onRemove} style={{ marginRight: 'auto' }}>
            Remove
          </Btn>
        ) : null}
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn primary onClick={() => onApply(value)}>
          {initial ? 'Update' : 'Add Link'}
        </Btn>
      </div>
    </Menu>
  )
}
