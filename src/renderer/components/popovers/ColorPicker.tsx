import type { ReactNode } from 'react'
import { Menu } from './Menu'
import type { PopoverState } from './Menu'

export const TEXT_COLORS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1D1D1F' },
  { name: 'Dark gray', hex: '#5F5F64' },
  { name: 'Gray', hex: '#9A9A9F' },
  { name: 'Light gray', hex: '#C7C7CC' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Brown', hex: '#8B5A2B' },
  { name: 'Red', hex: '#D13B2C' },
  { name: 'Orange', hex: '#E8710A' },
  { name: 'Yellow', hex: '#D9A400' },
  { name: 'Green', hex: '#2E9A4B' },
  { name: 'Teal', hex: '#0E8C8C' },
  { name: 'Blue', hex: '#1F5FD6' },
  { name: 'Indigo', hex: '#4A4ADB' },
  { name: 'Purple', hex: '#8E44AD' },
  { name: 'Pink', hex: '#D6336C' },
  { name: 'Dark red', hex: '#8A1C10' }
]

/** Word's highlight palette, so highlights survive in Word, Pages and Google Docs. */
export const HIGHLIGHT_COLORS: { name: string; hex: string }[] = [
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Green', hex: '#00FF00' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Magenta', hex: '#FF00FF' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Dark blue', hex: '#000080' },
  { name: 'Dark cyan', hex: '#008080' },
  { name: 'Dark green', hex: '#008000' },
  { name: 'Dark magenta', hex: '#800080' },
  { name: 'Dark red', hex: '#800000' },
  { name: 'Dark yellow', hex: '#808000' },
  { name: 'Dark gray', hex: '#808080' },
  { name: 'Light gray', hex: '#C0C0C0' },
  { name: 'Black', hex: '#000000' }
]

export function ColorPicker({ pop, kind, value, onPick, onCustom }: { pop: PopoverState; kind: 'text' | 'highlight'; value: string | null; onPick: (hex: string | null) => void; onCustom?: (hex: string) => void }): ReactNode {
  const palette = kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS
  const current = value?.toUpperCase() ?? null
  return (
    <Menu pop={pop} role="listbox" label={kind === 'text' ? 'Text color' : 'Highlight color'} style={{ minWidth: 0, padding: 0 }}>
      <div className="q-colors">
        <button type="button" className={['q-swatch', 'none', current === null ? 'is-on' : ''].join(' ')} aria-label={kind === 'text' ? 'Automatic' : 'No highlight'} title={kind === 'text' ? 'Automatic' : 'No highlight'} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(null)} />
        {palette.map((c) => (
          <button
            key={c.hex}
            type="button"
            className={['q-swatch', current === c.hex.toUpperCase() ? 'is-on' : ''].join(' ')}
            style={{ background: c.hex }}
            aria-label={c.name}
            title={c.name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c.hex)}
          />
        ))}
      </div>
      {kind === 'text' && onCustom ? (
        <div className="q-colors-foot">
          <span>Custom</span>
          <input type="color" aria-label="Custom color" value={current && /^#[0-9A-F]{6}$/.test(current) ? current : '#1D1D1F'} onChange={(e) => onCustom(e.target.value)} />
        </div>
      ) : null}
    </Menu>
  )
}
