import type { Editor } from '@tiptap/core'
import type { ReactNode } from 'react'
import type { ToolbarState } from '../../editor/useToolbarState'
import { setState } from '../../state/documentStore'
import { TBtn, VSep } from '../controls'
import { Icon } from '../icons'
import { AlignButtons, ColorButtons, FontFamilyPopup, FontSizePopup, IndentButtons, InlineButtons, InsertButtons, ListButtons, StylePopup } from './FormatControls'

/** Simple mode: one calm row. "All tools" switches to the Full toolbar. */
export function SimpleToolbar({ editor, state }: { editor: Editor; state: ToolbarState }): ReactNode {
  return (
    <div className="q-formatbar" role="toolbar" aria-label="Formatting">
      <StylePopup editor={editor} state={state} />
      <span style={{ width: 4 }} />
      <FontFamilyPopup editor={editor} state={state} width={148} />
      <span style={{ width: 4 }} />
      <FontSizePopup editor={editor} state={state} />
      <VSep />
      <InlineButtons editor={editor} state={state} />
      <ColorButtons editor={editor} state={state} />
      <VSep />
      <AlignButtons editor={editor} state={state} />
      <VSep />
      <ListButtons editor={editor} state={state} />
      <IndentButtons editor={editor} state={state} />
      <VSep />
      <InsertButtons editor={editor} state={state} />
      <span className="q-fill" />
      <button type="button" className="q-tbtn has-label" style={{ color: 'var(--q-text-secondary)' }} onMouseDown={(e) => e.preventDefault()} onClick={() => setState({ toolbarMode: 'full' })}>
        <Icon name="all-tools" />
        All tools
      </button>
    </div>
  )
}
