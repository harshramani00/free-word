import { useState } from 'react'
import type { ReactNode } from 'react'
import { Menu } from './Menu'

const MAX = 8

export function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }): ReactNode {
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 3, c: 3 })
  const cells: ReactNode[] = []
  for (let r = 1; r <= MAX; r++) {
    for (let c = 1; c <= MAX; c++) {
      const on = r <= hover.r && c <= hover.c
      cells.push(
        <button
          key={`${r}-${c}`}
          type="button"
          className={['q-grid-cell', on ? 'is-on' : ''].join(' ')}
          aria-label={`${r} × ${c} table`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setHover({ r, c })}
          onClick={() => onPick(r, c)}
        />
      )
    }
  }
  return (
    <Menu role="dialog" label="Insert table" style={{ minWidth: 0, padding: 0 }}>
      <div className="q-grid">{cells}</div>
      <div className="q-grid-label">
        {hover.r} × {hover.c} table
      </div>
    </Menu>
  )
}
