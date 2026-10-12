import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { Icon } from '../icons'

export interface PopoverState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  ref: RefObject<HTMLDivElement | null>
}

/** Open/close state for a popover anchored to a trigger; closes on outside pointer-down or Escape. */
export function usePopover(onClose?: () => void): PopoverState {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        onClose?.()
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        onClose?.()
      }
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return { open, setOpen, toggle: () => setOpen((o) => !o), ref }
}

export function Anchor({ pop, children, className, style }: { pop: PopoverState; children: ReactNode; className?: string; style?: CSSProperties }): ReactNode {
  return (
    <div className={['q-anchor', className].filter(Boolean).join(' ')} ref={pop.ref} style={style}>
      {children}
    </div>
  )
}

export function Menu({
  children,
  className,
  style,
  role = 'menu',
  label,
  placement = 'below'
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  role?: string
  label?: string
  placement?: 'below' | 'right'
}): ReactNode {
  return (
    <div className={['q-menu', 'q-pop', placement, className].filter(Boolean).join(' ')} role={role} aria-label={label} style={style}>
      {children}
    </div>
  )
}

export function MenuItem({
  children,
  shortcut,
  checked,
  disabled,
  onSelect,
  role = 'menuitem'
}: {
  children: ReactNode
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  onSelect?: () => void
  role?: string
}): ReactNode {
  return (
    <div
      className={['q-menu-item', checked ? 'is-checked' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      role={role}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => !disabled && onSelect?.()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) onSelect?.()
      }}
    >
      <Icon name="check" size="sm" className="check" style={{ strokeWidth: 1.8 }} />
      <span>{children}</span>
      {shortcut ? <span className="key">{shortcut}</span> : null}
    </div>
  )
}

export function MenuSep(): ReactNode {
  return <div className="q-menu-sep" />
}

export function MenuHead({ children }: { children: ReactNode }): ReactNode {
  return <div className="q-menu-head">{children}</div>
}
