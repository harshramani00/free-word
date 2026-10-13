import { Fragment } from 'react'
import type { ReactNode } from 'react'
import { PARAGRAPH_STYLES } from '../../editor/commands'
import type { ParagraphStyle } from '../../editor/commands'
import { Menu, MenuItem, MenuSep } from './Menu'
import type { PopoverState } from './Menu'

const PREVIEW: Record<ParagraphStyle, string> = {
  title: '700 20px/1.2 var(--q-font-doc)',
  h1: '700 17px/1.25 var(--q-font-doc)',
  h2: '600 15px/1.3 var(--q-font-doc)',
  h3: '600 13.5px/1.3 var(--q-font-doc)',
  body: '400 13.5px/1.3 var(--q-font-doc)',
  quote: 'italic 400 13.5px/1.3 var(--q-font-doc)'
}

export function StylePicker({ pop, current, onPick }: { pop: PopoverState; current: ParagraphStyle; onPick: (s: ParagraphStyle) => void }): ReactNode {
  return (
    <Menu pop={pop} label="Paragraph style" style={{ width: 232 }}>
      {PARAGRAPH_STYLES.map((s) => (
        <Fragment key={s.id}>
          {s.id === 'body' ? <MenuSep /> : null}
          <MenuItem role="menuitemradio" checked={current === s.id} shortcut={s.shortcut} onSelect={() => onPick(s.id)}>
            <span style={{ font: PREVIEW[s.id] }}>{s.label}</span>
          </MenuItem>
        </Fragment>
      ))}
    </Menu>
  )
}
