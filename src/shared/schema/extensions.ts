import type { Extensions } from '@tiptap/core'
import { Highlight } from '@tiptap/extension-highlight'
import { Image } from '@tiptap/extension-image'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { StarterKit } from '@tiptap/starter-kit'
import { Indent } from './indent'
import { PageBreak } from './pageBreak'
import { QuillTextAlign } from './textAlign'
import { Title } from './title'

/**
 * The document schema: everything that defines what a Quill document can contain.
 * Shared by the editor (renderer) and the .docx importer (main process / tests),
 * so it must not include anything that touches the DOM at load time.
 */
export function schemaExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener', target: null } },
      codeBlock: false,
      dropcursor: { width: 2 }
    }),
    Title,
    PageBreak,
    Indent,
    QuillTextAlign,
    TextStyleKit.configure({ lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: true, lastColumnResizable: true, allowTableNodeSelection: true } }),
    Image.configure({ allowBase64: true, inline: false })
  ]
}
