import { getStyleProperty } from '@tiptap/core'
import { TextAlign } from '@tiptap/extension-text-align'

export const ALIGNMENTS = ['left', 'center', 'right', 'justify'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/**
 * TextAlign that also understands a `data-align` attribute, so documents
 * imported from .docx (where mammoth cannot emit inline styles) keep their alignment.
 */
export const QuillTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const fromData = element.getAttribute('data-align')
              const fromStyle = getStyleProperty(element, 'text-align') || element.style?.textAlign
              const value = (fromData || fromStyle || '').replace(/^start$/, 'left').replace(/^end$/, 'right')
              return ALIGNMENTS.includes(value as Alignment) ? value : null
            },
            renderHTML: (attributes: { textAlign?: string | null }) => {
              if (!attributes.textAlign || !ALIGNMENTS.includes(attributes.textAlign as Alignment)) return {}
              return { style: `text-align: ${attributes.textAlign}`, 'data-align': attributes.textAlign }
            }
          }
        }
      }
    ]
  }
}).configure({
  types: ['heading', 'paragraph', 'title'],
  alignments: [...ALIGNMENTS],
  defaultAlignment: 'left'
})
