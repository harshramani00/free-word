import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../icons'

export interface PopoverState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  /** The anchor wrapper; menus position themselves relative to it. */
  ref: RefObject<HTMLDivElement | null>
  /** The floating menu element (portalled), so outside-click detection can ignore it. */
  menuRef: RefObject<HTMLDivElement | null>
}

/** Open/close state for a popover anchored to a trigger; closes on outside pointer-down or Escape. */
export function usePopover(onClose?: () => void): PopoverState {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
      onClose?.()
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
  return { open, setOpen, toggle: () => setOpen((o) => !o), ref, menuRef }
}

export function Anchor({ pop, children, className, style }: { pop: PopoverState; children: ReactNode; className?: string; style?: CSSProperties }): ReactNode {
  return (
    <div className={['q-anchor', className].filter(Boolean).join(' ')} ref={pop.ref} style={style}>
      {children}
    </div>
  )
}

/**
 * A floating menu. Rendered into document.body (so toolbar overflow cannot clip it) and
 * positioned against the anchor of the `pop` it belongs to.
 */
export function Menu({
  pop,
  children,
  className,
  style,
  role = 'menu',
  label,
  placement = 'below'
}: {
  pop: PopoverState
  children: ReactNode
  className?: string
  style?: CSSProperties
  role?: string
  label?: string
  placement?: 'below' | 'right'
}): ReactNode {
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const place = (): void => {
      const a = pop.ref.current?.getBoundingClientRect()
      if (!a) return
      const menu = pop.menuRef.current
      const w = menu?.offsetWidth ?? 240
      const h = menu?.offsetHeight ?? 200
      let left = placement === 'right' ? a.right + 8 : a.left
      let top = placement === 'right' ? a.top : a.bottom + 4
      if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w)
      if (top + h > window.innerHeight - 8) top = Math.max(8, placement === 'right' ? window.innerHeight - 8 - h : a.top - 4 - h)
      setPos({ left, top, maxHeight: window.innerHeight - 16 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [pop, placement])
  return createPortal(
    <div
      ref={pop.menuRef}
      className={['q-menu', 'q-pop', className].filter(Boolean).join(' ')}
      role={role}
      aria-label={label}
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxHeight: pos?.maxHeight, overflowY: 'auto', ...style }}
    >
      {children}
    </div>,
    document.body
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
