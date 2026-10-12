import type { Editor } from '@tiptap/core'
import type { ReactNode } from 'react'
import { PARAGRAPH_STYLES, setParagraphStyle, stepFontSize } from '../../editor/commands'
import type { ParagraphStyle } from '../../editor/commands'
import type { ToolbarState } from '../../editor/useToolbarState'
import { TBtn, VSep, keepFocus } from '../controls'
import { Icon } from '../icons'
import { AlignButtons, ColorButtons, FontFamilyPopup, FontSizePopup, IndentButtons, InlineButtons, ListButtons } from './FormatControls'
import { RBig, RCol, RGroup, RRow, RRows, RSmall, RSmalls, Ribbon } from './Ribbon'

const CHIP_FONT: Record<ParagraphStyle, string> = {
  body: '400 14px/1 var(--q-font-doc)',
  title: '700 19px/1 var(--q-font-doc)',
  h1: '700 16px/1 var(--q-font-doc)',
  h2: '600 15px/1 var(--q-font-doc)',
  h3: '600 13.5px/1 var(--q-font-doc)',
  quote: 'italic 400 14px/1 var(--q-font-doc)'
}
const CHIP_SAMPLE: Record<ParagraphStyle, string> = { body: 'AaBbCc', title: 'AaBb', h1: 'AaBbC', h2: 'AaBbC', h3: 'AaBbCc', quote: 'AaBbCc' }
const CHIP_ORDER: ParagraphStyle[] = ['body', 'title', 'h1', 'h2', 'h3', 'quote']

export function HomeRibbon({ editor, state, onFind }: { editor: Editor; state: ToolbarState; onFind: () => void }): ReactNode {
  const chain = () => editor.chain().focus()
  const exec = (cmd: 'cut' | 'copy' | 'paste'): void => {
    editor.view.focus()
    document.execCommand(cmd)
  }
  return (
    <Ribbon label="Home">
      <RGroup label="Clipboard">
        <RBig label="Paste" icon="rb-textbox" onClick={() => exec('paste')} />
        <RCol>
          <TBtn label="Cut" icon="cut" className="is-r" onClick={() => exec('cut')} />
          <TBtn label="Copy" icon="copy" className="is-r" onClick={() => exec('copy')} />
          <TBtn label="Format painter" icon="format-painter" className="is-r" disabled />
        </RCol>
      </RGroup>

      <RGroup label="Font">
        <RRows>
          <RRow>
            <FontFamilyPopup editor={editor} state={state} />
            <span style={{ width: 4 }} />
            <FontSizePopup editor={editor} state={state} />
            <span style={{ width: 4 }} />
            <TBtn label="Grow font" icon="grow-font" onClick={() => stepFontSize(editor, 1)} />
            <TBtn label="Shrink font" icon="shrink-font" onClick={() => stepFontSize(editor, -1)} />
            <TBtn label="Change case" glyph={<span style={{ fontSize: 13, fontWeight: 500 }}>Aa</span>} chev disabled />
            <TBtn label="Clear formatting" icon="clear-formatting" onClick={() => chain().unsetAllMarks().run()} />
          </RRow>
          <RRow>
            <InlineButtons editor={editor} state={state} extended />
            <VSep />
            <ColorButtons editor={editor} state={state} chev />
          </RRow>
        </RRows>
      </RGroup>

      <RGroup label="Paragraph">
        <RRows>
          <RRow>
            <ListButtons editor={editor} state={state} chev />
            <TBtn label="Multilevel list" icon="multilevel-list" chev disabled />
            <VSep />
            <IndentButtons editor={editor} state={state} />
            <VSep />
            <TBtn label="Sort" icon="sort" disabled />
            <TBtn label="Show formatting marks" glyph={<span style={{ fontSize: 15, fontWeight: 500 }}>¶</span>} disabled />
          </RRow>
          <RRow>
            <AlignButtons editor={editor} state={state} />
            <VSep />
            <TBtn label="Line and paragraph spacing" icon="line-and-paragraph-spacing" chev disabled />
            <TBtn label="Shading" icon="shading" chev disabled />
            <TBtn label="Borders" icon="borders" chev disabled />
          </RRow>
        </RRows>
      </RGroup>

      <RGroup label="Styles" gap={4}>
        {CHIP_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            className={['q-stylechip', state.style === id ? 'is-on' : ''].join(' ')}
            aria-pressed={state.style === id}
            onMouseDown={keepFocus}
            onClick={() => setParagraphStyle(editor, id)}
          >
            <span style={{ font: CHIP_FONT[id], color: id === 'quote' ? 'var(--q-doc-text-secondary)' : undefined }}>{CHIP_SAMPLE[id]}</span>
            <span className="name">{PARAGRAPH_STYLES.find((s) => s.id === id)?.label}</span>
          </button>
        ))}
        <button type="button" className="q-gallery-more" aria-label="More styles" disabled aria-disabled="true">
          <Icon name="more-styles" size="sm" />
        </button>
      </RGroup>

      <RGroup label="Editing">
        <RSmalls>
          <RSmall label="Find" icon="find" onClick={onFind} />
          <RSmall label="Replace" icon="replace" disabled />
          <RSmall label="Select" icon="select" onClick={() => chain().selectAll().run()} />
        </RSmalls>
      </RGroup>
    </Ribbon>
  )
}
