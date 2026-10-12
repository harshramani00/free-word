import { Extension } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'

export const MAX_INDENT = 8
/** One indent step is half an inch (720 twips, 48 px). */
export const INDENT_STEP_PX = 48

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** Increase indentation: sink a list item, or add one indent level to a paragraph/heading. */
      indent: () => ReturnType
      /** Decrease indentation: lift a list item, or remove one indent level. */
      outdent: () => ReturnType
    }
  }
}

export interface IndentOptions {
  types: string[]
}

/**
 * Adds an `indent` attribute (0–8) to paragraphs and headings and the indent/outdent commands.
 * Inside lists the commands fall through to sinkListItem/liftListItem so nesting works as expected.
 */
export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return { types: ['paragraph', 'heading', 'title'] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => {
              const data = el.getAttribute('data-indent')
              if (data) return Math.min(MAX_INDENT, Math.max(0, parseInt(data, 10) || 0))
              const cls = Array.from(el.classList).find((c) => /^qi-\d+$/.test(c))
              if (cls) return Math.min(MAX_INDENT, parseInt(cls.slice(3), 10) || 0)
              const ml = parseFloat(el.style.marginLeft || el.style.paddingLeft || '0')
              return ml > 0 ? Math.min(MAX_INDENT, Math.round(ml / INDENT_STEP_PX)) : 0
            },
            renderHTML: (attrs) => {
              const level = Number(attrs.indent) || 0
              if (level <= 0) return {}
              return { 'data-indent': String(level), style: `margin-left: ${level * INDENT_STEP_PX}px` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    const change =
      (delta: 1 | -1) =>
      () =>
      ({ editor, commands, state, tr, dispatch }: CommandProps) => {
        if (editor.isActive('listItem')) {
          return delta > 0 ? commands.sinkListItem('listItem') : commands.liftListItem('listItem')
        }
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return
          const current = Number(node.attrs.indent) || 0
          const next = Math.min(MAX_INDENT, Math.max(0, current + delta))
          if (next !== current) {
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
            changed = true
          }
          return false
        })
        return changed
      }
    return {
      indent: change(1),
      outdent: change(-1)
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.indent(),
      'Shift-Tab': () => this.editor.commands.outdent()
    }
  }
})
