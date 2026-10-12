import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'

/** Keeps focus (and the selection) in the editor while clicking toolbar controls. */
export const keepFocus = (e: MouseEvent): void => e.preventDefault()

export interface TBtnProps {
  label: string
  icon?: IconName
  glyph?: ReactNode
  text?: string
  on?: boolean
  disabled?: boolean
  small?: boolean
  chev?: boolean
  pressed?: boolean
  className?: string
  style?: CSSProperties
  swatch?: string | null
  onClick?: () => void
  ariaHasPopup?: boolean
  ariaExpanded?: boolean
}

/** Toolbar button (.q-tbtn) with icon, glyph or text label. */
export function TBtn({ label, icon, glyph, text, on, disabled, small, chev, pressed, className, style, swatch, onClick, ariaHasPopup, ariaExpanded }: TBtnProps): ReactNode {
  const cls = ['q-tbtn', small ? 'is-small' : '', on ? 'is-on' : '', pressed ? 'is-pressed' : '', disabled ? 'is-disabled' : '', text ? 'has-label' : '', chev ? 'has-chev' : '', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type="button"
      className={cls}
      aria-label={text ? undefined : label}
      title={label}
      aria-pressed={on === undefined ? undefined : on}
      aria-disabled={disabled || undefined}
      aria-haspopup={ariaHasPopup || undefined}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      style={style}
      onMouseDown={keepFocus}
      onClick={() => !disabled && onClick?.()}
    >
      {icon ? <Icon name={icon} size={small ? 'sm' : undefined} /> : null}
      {glyph ? <span className="q-glyph">{glyph}</span> : null}
      {text ? <span>{text}</span> : null}
      {chev ? <Icon name="chev" className="chev" /> : null}
      {swatch !== undefined ? <span className="q-swatchbar" style={{ background: swatch ?? 'transparent', right: chev ? 15 : undefined }} /> : null}
    </button>
  )
}

/** Popup (dropdown) button (.q-popup). */
export function PopupBtn({
  label,
  children,
  width,
  disabled,
  pressed,
  onClick,
  style,
  expanded
}: {
  label: string
  children: ReactNode
  width?: number
  disabled?: boolean
  pressed?: boolean
  onClick?: () => void
  style?: CSSProperties
  expanded?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      className={['q-popup', pressed ? 'is-pressed' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={expanded}
      disabled={disabled}
      style={{ width, ...style }}
      onMouseDown={keepFocus}
      onClick={() => !disabled && onClick?.()}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      <Icon name="chevron-updown" size="xs" />
    </button>
  )
}

/** Push button (.q-btn). */
export function Btn({ children, primary, disabled, onClick, className, style, autoFocus }: { children: ReactNode; primary?: boolean; disabled?: boolean; onClick?: () => void; className?: string; style?: CSSProperties; autoFocus?: boolean }): ReactNode {
  return (
    <button
      type="button"
      className={['q-btn', primary ? 'is-primary' : '', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onClick}
      style={style}
      autoFocus={autoFocus}
    >
      {children}
    </button>
  )
}

/** Segmented control (.q-seg). */
export function Seg<T extends string>({ options, value, onChange, label, icons, style, disabled }: { options: { value: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; label: string; icons?: boolean; style?: CSSProperties; disabled?: boolean }): ReactNode {
  return (
    <div className={['q-seg', icons ? 'icons' : ''].filter(Boolean).join(' ')} role="group" aria-label={label} style={style}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} aria-label={o.title} title={o.title} disabled={disabled} onMouseDown={keepFocus} onClick={() => onChange(o.value)} style={icons ? undefined : { flex: 1 }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function VSep({ style }: { style?: CSSProperties }): ReactNode {
  return <span className="q-vsep" style={style} />
}

export function SearchField({ value, onChange, placeholder, onEnter, style, className, label }: { value: string; onChange: (v: string) => void; placeholder: string; onEnter?: (shift: boolean) => void; style?: CSSProperties; className?: string; label?: string }): ReactNode {
  return (
    <label className={['q-search', className].filter(Boolean).join(' ')} style={style}>
      <Icon name="search" />
      <span className="q-sr">{label ?? placeholder}</span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.(e.shiftKey)
        }}
      />
    </label>
  )
}
