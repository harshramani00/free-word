import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a manual page break after the current block. */
      setPageBreak: () => ReturnType
    }
  }
}

/** A manual page break. Renders as <hr class="page-break">; maps to w:br w:type="page" in docx. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'hr.page-break', priority: 60 }, { tag: 'div.page-break', priority: 60 }]
  },

  renderHTML() {
    return ['hr', { class: 'page-break', 'data-page-break': 'true' }]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain, state }) => {
          const { $to } = state.selection
          const after = $to.after($to.depth > 0 ? 1 : 0)
          return chain()
            .insertContentAt(after, [{ type: this.name }, { type: 'paragraph' }])
            .focus(after + 2)
            .run()
        }
    }
  }
})
