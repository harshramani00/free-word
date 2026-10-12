import { mergeAttributes, Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    title: {
      /** Turn the current block into a document Title paragraph. */
      setTitle: () => ReturnType
      /** Toggle between Title and Body. */
      toggleTitle: () => ReturnType
    }
  }
}

/**
 * The "Title" paragraph style. A textblock like a heading, serialised to HTML as
 * <h1 class="q-title"> and to docx as the built-in Word "Title" style.
 */
export const Title = Node.create({
  name: 'title',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      textAlign: {
        default: null,
        parseHTML: (el) => el.style.textAlign || el.getAttribute('data-align') || null,
        renderHTML: (attrs) => (attrs.textAlign ? { style: `text-align: ${attrs.textAlign}` } : {})
      }
    }
  },

  parseHTML() {
    return [
      { tag: 'h1.q-title', priority: 60 },
      { tag: 'p.q-title', priority: 60 },
      { tag: 'div.q-title', priority: 60 }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['h1', mergeAttributes(HTMLAttributes, { class: 'q-title' }), 0]
  },

  addCommands() {
    return {
      setTitle:
        () =>
        ({ commands }) =>
          commands.setNode(this.name),
      toggleTitle:
        () =>
        ({ commands }) =>
          commands.toggleNode(this.name, 'paragraph')
    }
  }
})
