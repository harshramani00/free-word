import type { CSSProperties, ReactNode } from 'react'
import { keepFocus } from '../controls'
import { Icon } from '../icons'
import type { IconName } from '../icons'

export function Ribbon({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="q-ribbon" role="toolbar" aria-label={label}>
      {children}
    </div>
  )
}

export function RGroup({ label, children, gap }: { label: string; children: ReactNode; gap?: number }): ReactNode {
  return (
    <div className="q-rgroup">
      <div className="q-rgroup-body" style={gap ? { gap } : undefined}>
        {children}
      </div>
      <div className="q-rgroup-label">{label}</div>
    </div>
  )
}

export function RBig({ label, icon, glyph, on, disabled, pressed, onClick, style }: { label: string; icon?: IconName; glyph?: string; on?: boolean; disabled?: boolean; pressed?: boolean; onClick?: () => void; style?: CSSProperties }): ReactNode {
  return (
    <button
      type="button"
      className={['q-rbig', on ? 'is-on' : '', pressed ? 'is-pressed' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      aria-pressed={on === undefined ? undefined : on}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      style={style}
      onMouseDown={keepFocus}
      onClick={() => !disabled && onClick?.()}
    >
      {icon ? <Icon name={icon} /> : null}
      {glyph ? <span className="q-rglyph">{glyph}</span> : null}
      <span>{label}</span>
    </button>
  )
}

export function RSmall({ label, icon, glyph, on, disabled, onClick }: { label: string; icon?: IconName; glyph?: string; on?: boolean; disabled?: boolean; onClick?: () => void }): ReactNode {
  return (
    <button
      type="button"
      className={['q-rsmall', on ? 'is-on' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      aria-pressed={on === undefined ? undefined : on}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={() => !disabled && onClick?.()}
    >
      {icon ? <Icon name={icon} /> : null}
      {glyph ? <span className="q-rglyph-sm">{glyph}</span> : null}
      {label}
    </button>
  )
}

export function RSmalls({ children }: { children: ReactNode }): ReactNode {
  return <div className="q-rsmalls">{children}</div>
}
export function RRows({ children }: { children: ReactNode }): ReactNode {
  return <div className="q-rrows">{children}</div>
}
export function RRow({ children }: { children: ReactNode }): ReactNode {
  return <div className="q-rrow">{children}</div>
}
export function RCol({ children, style }: { children: ReactNode; style?: CSSProperties }): ReactNode {
  return (
    <div className="q-rcol" style={style}>
      {children}
    </div>
  )
}

export function RFields({ fields }: { fields: { label: string; value: string; onChange?: (v: string) => void }[] }): ReactNode {
  return (
    <div className="q-rfields">
      {fields.map((f) => (
        <label key={f.label} className="q-rfield">
          {f.label}
          <input className="q-field sm" type="text" value={f.value} readOnly={!f.onChange} disabled={!f.onChange} onChange={(e) => f.onChange?.(e.target.value)} />
        </label>
      ))}
    </div>
  )
}

export function RChecks({ checks }: { checks: { label: string; on: boolean; onChange?: (v: boolean) => void }[] }): ReactNode {
  return (
    <div className="q-rcol">
      {checks.map((c) => (
        <label key={c.label} className="q-rcheck" style={c.onChange ? undefined : { color: 'var(--q-text-tertiary)' }}>
          <input type="checkbox" checked={c.on} disabled={!c.onChange} onChange={(e) => c.onChange?.(e.target.checked)} />
          {c.label}
        </label>
      ))}
    </div>
  )
}
