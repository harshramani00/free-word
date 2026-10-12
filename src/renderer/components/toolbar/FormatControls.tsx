import type { Editor } from '@tiptap/core'
import type { ReactNode } from 'react'
import { ALIGNMENTS } from '../../../shared/schema/textAlign'
import type { Alignment } from '../../../shared/schema/textAlign'
import {
  FONT_SIZES,
  FONTS,
  PARAGRAPH_STYLES,
  insertImageFromDisk,
  insertTable,
  setAlignment,
  setFontFamily,
  setFontSize,
  setLink,
  setParagraphStyle
} from '../../editor/commands'
import type { ParagraphStyle } from '../../editor/commands'
import type { ToolbarState } from '../../editor/useToolbarState'
import { PopupBtn, TBtn } from '../controls'
import type { IconName } from '../icons'
import { ColorPicker } from '../popovers/ColorPicker'
import { FontPicker, pushRecentFont } from '../popovers/FontPicker'
import { LinkPopover } from '../popovers/LinkPopover'
import { Anchor, Menu, MenuItem, usePopover } from '../popovers/Menu'
import { StylePicker } from '../popovers/StylePicker'
import { TableGridPicker } from '../popovers/TableGridPicker'

export interface ControlProps {
  editor: Editor
  state: ToolbarState
}

export function StylePopup({ editor, state, width = 112 }: ControlProps & { width?: number }): ReactNode {
  const pop = usePopover()
  const label = PARAGRAPH_STYLES.find((s) => s.id === state.style)?.label ?? 'Body'
  return (
    <Anchor pop={pop}>
      <PopupBtn label="Paragraph style" width={width} pressed={pop.open} expanded={pop.open} onClick={pop.toggle}>
        {label}
      </PopupBtn>
      {pop.open ? (
        <StylePicker
          current={state.style}
          onPick={(s: ParagraphStyle) => {
            pop.setOpen(false)
            setParagraphStyle(editor, s)
          }}
        />
      ) : null}
    </Anchor>
  )
}

export function FontFamilyPopup({ editor, state, width = 150 }: ControlProps & { width?: number }): ReactNode {
  const pop = usePopover()
  const css = FONTS.find((f) => f.name === state.fontFamily)?.css ?? `'${state.fontFamily}', var(--q-font-doc)`
  return (
    <Anchor pop={pop}>
      <PopupBtn label="Font family" width={width} pressed={pop.open} expanded={pop.open} onClick={pop.toggle} style={{ fontFamily: css }}>
        {state.fontFamily}
      </PopupBtn>
      {pop.open ? (
        <FontPicker
          current={state.fontFamily}
          inDocument={state.docFonts}
          onPick={(f) => {
            pop.setOpen(false)
            pushRecentFont(f.name)
            setFontFamily(editor, f)
          }}
        />
      ) : null}
    </Anchor>
  )
}

export function FontSizePopup({ editor, state }: ControlProps): ReactNode {
  const pop = usePopover()
  return (
    <Anchor pop={pop}>
      <PopupBtn label="Font size" width={56} pressed={pop.open} expanded={pop.open} onClick={pop.toggle}>
        {state.fontSize}
      </PopupBtn>
      {pop.open ? (
        <Menu role="listbox" label="Font size" style={{ minWidth: 88, maxHeight: 360, overflowY: 'auto' }}>
          {FONT_SIZES.map((s) => (
            <MenuItem
              key={s}
              role="option"
              checked={s === state.fontSize}
              onSelect={() => {
                pop.setOpen(false)
                setFontSize(editor, s)
              }}
            >
              {s}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </Anchor>
  )
}

export function InlineButtons({ editor, state, extended }: ControlProps & { extended?: boolean }): ReactNode {
  const chain = () => editor.chain().focus()
  return (
    <>
      <TBtn label="Bold" on={state.bold} glyph={<span style={{ fontWeight: 700 }}>B</span>} onClick={() => chain().toggleBold().run()} />
      <TBtn label="Italic" on={state.italic} glyph={<span style={{ fontFamily: 'var(--q-font-doc)', fontStyle: 'italic', fontWeight: 600, fontSize: 16 }}>I</span>} onClick={() => chain().toggleItalic().run()} />
      <TBtn label="Underline" on={state.underline} glyph={<span style={{ fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 2 }}>U</span>} onClick={() => chain().toggleUnderline().run()} />
      <TBtn label="Strikethrough" on={state.strike} glyph={<span style={{ fontWeight: 500, textDecoration: 'line-through' }}>S</span>} onClick={() => chain().toggleStrike().run()} />
      {extended ? (
        <>
          <TBtn
            label="Subscript"
            on={state.subscript}
            glyph={
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                x<sub style={{ fontSize: 9 }}>2</sub>
              </span>
            }
            onClick={() => chain().unsetMark('superscript').toggleMark('subscript').run()}
          />
          <TBtn
            label="Superscript"
            on={state.superscript}
            glyph={
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                x<sup style={{ fontSize: 9 }}>2</sup>
              </span>
            }
            onClick={() => chain().unsetMark('subscript').toggleMark('superscript').run()}
          />
        </>
      ) : null}
    </>
  )
}

export function ColorButtons({ editor, state, chev }: ControlProps & { chev?: boolean }): ReactNode {
  const textPop = usePopover()
  const hlPop = usePopover()
  return (
    <>
      <Anchor pop={textPop}>
        <TBtn label="Text color" icon="text-color" chev={chev} swatch={state.color ?? '#D13B2C'} pressed={textPop.open} ariaHasPopup ariaExpanded={textPop.open} onClick={textPop.toggle} />
        {textPop.open ? (
          <ColorPicker
            kind="text"
            value={state.color}
            onPick={(hex) => {
              textPop.setOpen(false)
              if (hex) editor.chain().focus().setColor(hex).run()
              else editor.chain().focus().unsetColor().run()
            }}
            onCustom={(hex) => editor.chain().focus().setColor(hex).run()}
          />
        ) : null}
      </Anchor>
      <Anchor pop={hlPop}>
        <TBtn label="Highlight color" icon="highlight-color" chev={chev} swatch={state.highlight ?? '#FFD60A'} pressed={hlPop.open} ariaHasPopup ariaExpanded={hlPop.open} onClick={hlPop.toggle} />
        {hlPop.open ? (
          <ColorPicker
            kind="highlight"
            value={state.highlight}
            onPick={(hex) => {
              hlPop.setOpen(false)
              if (hex) editor.chain().focus().setHighlight({ color: hex }).run()
              else editor.chain().focus().unsetHighlight().run()
            }}
          />
        ) : null}
      </Anchor>
    </>
  )
}

const ALIGN_ICON: Record<Alignment, IconName> = { left: 'align-left', center: 'align-center', right: 'align-right', justify: 'justify' }
const ALIGN_LABEL: Record<Alignment, string> = { left: 'Align left', center: 'Align center', right: 'Align right', justify: 'Justify' }

export function AlignButtons({ editor, state }: ControlProps): ReactNode {
  return (
    <>
      {ALIGNMENTS.map((a) => (
        <TBtn key={a} label={ALIGN_LABEL[a]} icon={ALIGN_ICON[a]} on={state.align === a} onClick={() => setAlignment(editor, a)} />
      ))}
    </>
  )
}

export function ListButtons({ editor, state, chev }: ControlProps & { chev?: boolean }): ReactNode {
  return (
    <>
      <TBtn label="Bulleted list" icon="bulleted-list" chev={chev} on={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <TBtn label="Numbered list" icon="numbered-list" chev={chev} on={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
    </>
  )
}

export function IndentButtons({ editor }: ControlProps): ReactNode {
  return (
    <>
      <TBtn label="Decrease indent" icon="decrease-indent" onClick={() => editor.chain().focus().outdent().run()} />
      <TBtn label="Increase indent" icon="increase-indent" onClick={() => editor.chain().focus().indent().run()} />
    </>
  )
}

export function TableInsertButton({ editor, big }: { editor: Editor; big?: boolean; children?: ReactNode }): ReactNode {
  const pop = usePopover()
  return (
    <Anchor pop={pop}>
      {big ? (
        <button type="button" className={['q-rbig', pop.open ? 'is-pressed' : ''].join(' ')} aria-haspopup="dialog" aria-expanded={pop.open} onMouseDown={(e) => e.preventDefault()} onClick={pop.toggle}>
          <svg className="q-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z M2 6.5h12M2 9.8h12M6.5 6.5V13" />
          </svg>
          <span>Table</span>
        </button>
      ) : (
        <TBtn label="Insert table" icon="insert-table" pressed={pop.open} ariaHasPopup ariaExpanded={pop.open} onClick={pop.toggle} />
      )}
      {pop.open ? (
        <TableGridPicker
          onPick={(r, c) => {
            pop.setOpen(false)
            insertTable(editor, r, c)
          }}
        />
      ) : null}
    </Anchor>
  )
}

export function LinkButton({ editor, state, big }: ControlProps & { big?: boolean }): ReactNode {
  const pop = usePopover()
  const apply = (href: string): void => {
    pop.setOpen(false)
    setLink(editor, href)
  }
  return (
    <Anchor pop={pop}>
      {big ? (
        <button type="button" className={['q-rbig', state.linkHref !== null ? 'is-on' : '', pop.open ? 'is-pressed' : ''].join(' ')} aria-haspopup="dialog" aria-expanded={pop.open} onMouseDown={(e) => e.preventDefault()} onClick={pop.toggle}>
          <svg className="q-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
          </svg>
          <span>Link</span>
        </button>
      ) : (
        <TBtn label="Insert link" icon="insert-link" on={state.linkHref !== null} pressed={pop.open} ariaHasPopup ariaExpanded={pop.open} onClick={pop.toggle} />
      )}
      {pop.open ? <LinkPopover initial={state.linkHref ?? ''} onApply={apply} onRemove={() => apply('')} onClose={() => pop.setOpen(false)} /> : null}
    </Anchor>
  )
}

/** Opens the link popover programmatically (⌘K / menu). */
export function InsertButtons({ editor, state }: ControlProps): ReactNode {
  return (
    <>
      <TableInsertButton editor={editor} />
      <TBtn label="Insert image" icon="insert-image" onClick={() => void insertImageFromDisk(editor)} />
      <TBtn label="Insert page break" icon="insert-page-break" onClick={() => editor.chain().focus().setPageBreak().run()} />
      <TBtn label="Insert horizontal rule" icon="insert-horizontal-rule" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
      <LinkButton editor={editor} state={state} />
    </>
  )
}
