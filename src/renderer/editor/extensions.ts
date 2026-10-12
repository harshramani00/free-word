import type { Extensions } from '@tiptap/core'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { schemaExtensions } from '../../shared/schema/extensions'
import { Pagination } from './extensions/pagination'
import type { PageMetrics } from './extensions/pagination'

/** Editor extensions: the shared schema plus editor-only behaviour. */
export function editorExtensions(metrics: PageMetrics, onLayout: (layout: { pages: number }) => void): Extensions {
  return [
    ...schemaExtensions(),
    Placeholder.configure({ placeholder: 'Start writing…', showOnlyWhenEditable: true, showOnlyCurrent: true }),
    CharacterCount.configure({ limit: null }),
    Pagination.configure({ metrics, onLayout })
  ]
}
