import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import type { Alignment } from '../../shared/schema/textAlign'
import { currentAlignment, currentFontFamily, currentFontSize, currentParagraphStyle } from './commands'
import type { ParagraphStyle } from './commands'

export interface ToolbarState {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  subscript: boolean
  superscript: boolean
  style: ParagraphStyle
  align: Alignment
  bulletList: boolean
  orderedList: boolean
  inTable: boolean
  canUndo: boolean
  canRedo: boolean
  color: string | null
  highlight: string | null
  fontSize: number
  fontFamily: string
  linkHref: string | null
  docFonts: string[]
  selectionEmpty: boolean
}

export function useToolbarState(editor: Editor): ToolbarState {
  return useEditorState({
    editor,
    selector: ({ editor: e }): ToolbarState => {
      const fonts = new Set<string>()
      e.state.doc.descendants((node) => {
        for (const m of node.marks) {
          const ff = m.attrs.fontFamily as string | undefined
          if (m.type.name === 'textStyle' && ff) fonts.add(ff.split(',')[0].trim().replace(/^['"]|['"]$/g, ''))
        }
        return true
      })
      return {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        subscript: e.isActive('subscript'),
        superscript: e.isActive('superscript'),
        style: currentParagraphStyle(e),
        align: currentAlignment(e),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        inTable: e.isActive('table'),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        color: (e.getAttributes('textStyle').color as string | undefined) ?? null,
        highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? '#FFFF00') : null,
        fontSize: currentFontSize(e),
        fontFamily: currentFontFamily(e),
        linkHref: e.isActive('link') ? ((e.getAttributes('link').href as string | undefined) ?? '') : null,
        docFonts: ['Source Serif 4', ...fonts].filter((f, i, a) => a.indexOf(f) === i),
        selectionEmpty: e.state.selection.empty
      }
    }
  })
}
