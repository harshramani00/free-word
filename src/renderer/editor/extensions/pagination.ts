import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'

export interface PageMetrics {
  /** Height of the text column on one page (px at 100%). */
  textHeight: number
  /** Distance from the bottom of one page's text column to the top of the next: bottom margin + gap + top margin. */
  gap: number
}

export interface PaginationLayout {
  pages: number
}

export interface PaginationOptions {
  metrics: PageMetrics
  onLayout?: (layout: PaginationLayout) => void
}

interface Spacer {
  pos: number
  height: number
}

interface PluginState {
  decorations: DecorationSet
  spacers: Spacer[]
  pages: number
}

export const paginationKey = new PluginKey<PluginState>('quillPagination')

const SET_SPACERS = 'quill-pagination-set'

/** Containers whose children may be pushed individually instead of the whole block. */
const DESCEND = new Set(['UL', 'OL', 'BLOCKQUOTE'])

interface Measured {
  el: HTMLElement
  pos: number
  top: number
  height: number
}

/** Measure blocks in "natural" coordinates (as if no spacers existed). */
function measure(view: EditorView): Measured[] {
  const out: Measured[] = []
  const root = view.dom
  const rootRect = root.getBoundingClientRect()
  const rootTop = rootRect.top
  // CSS `zoom` is applied on an ancestor, so compare the rendered width with the layout width.
  const zoom = root.offsetWidth > 0 ? rootRect.width / root.offsetWidth : 1

  const walk = (container: HTMLElement, shift: number): number => {
    for (const child of Array.from(container.children) as HTMLElement[]) {
      if (child.classList.contains('q-spacer')) {
        shift += child.getBoundingClientRect().height / zoom
        continue
      }
      if (child.classList.contains('ProseMirror-widget') || child.classList.contains('ProseMirror-gapcursor')) continue
      if (DESCEND.has(child.tagName)) {
        shift = walk(child, shift)
        continue
      }
      let pos: number
      try {
        pos = view.posAtDOM(child, 0)
      } catch {
        continue
      }
      const rect = child.getBoundingClientRect()
      const style = getComputedStyle(child)
      const mt = parseFloat(style.marginTop) || 0
      const mb = parseFloat(style.marginBottom) || 0
      const top = (rect.top - rootTop) / zoom - mt - shift
      out.push({ el: child, pos, top, height: rect.height / zoom + mt + mb })
    }
    return shift
  }
  walk(root, 0)
  return out
}

function computeSpacers(view: EditorView, metrics: PageMetrics): { spacers: Spacer[]; pages: number } {
  const blocks = measure(view)
  const stride = metrics.textHeight + metrics.gap
  const spacers: Spacer[] = []
  let added = 0
  let lastBottom = 0

  for (const block of blocks) {
    const top = block.top + added
    const bottom = top + block.height
    const page = Math.floor(top / stride)
    const pageBottom = page * stride + metrics.textHeight
    const isPageBreak = block.el.matches('hr.page-break')

    if (isPageBreak) {
      // Everything after a manual page break starts on the next page.
      const nextTop = (page + 1) * stride
      const spacerHeight = nextTop - bottom
      if (spacerHeight > 0.5) {
        const after = view.state.doc.resolve(block.pos).after() ?? block.pos
        spacers.push({ pos: Math.min(after, view.state.doc.content.size), height: spacerHeight })
        added += spacerHeight
      }
      lastBottom = Math.max(lastBottom, bottom)
      continue
    }

    if (bottom > pageBottom + 0.5 && block.height <= metrics.textHeight && top > page * stride + 0.5) {
      const nextTop = (page + 1) * stride
      const spacerHeight = nextTop - top
      spacers.push({ pos: block.pos, height: spacerHeight })
      added += spacerHeight
      lastBottom = Math.max(lastBottom, bottom + spacerHeight)
    } else {
      lastBottom = Math.max(lastBottom, bottom)
    }
  }

  const pages = Math.max(1, Math.floor(Math.max(0, lastBottom - 1) / stride) + 1)
  return { spacers, pages }
}

function buildDecorations(state: EditorState, spacers: Spacer[]): DecorationSet {
  const decos = spacers
    .filter((s) => s.pos >= 0 && s.pos <= state.doc.content.size)
    .map((s) =>
      Decoration.widget(
        s.pos,
        () => {
          const el = document.createElement('div')
          el.className = 'q-spacer'
          el.style.height = `${s.height}px`
          el.contentEditable = 'false'
          return el
        },
        { side: -1, key: `spacer-${s.pos}-${Math.round(s.height)}`, ignoreSelection: true }
      )
    )
  return DecorationSet.create(state.doc, decos)
}

function sameSpacers(a: Spacer[], b: Spacer[]): boolean {
  if (a.length !== b.length) return false
  return a.every((s, i) => s.pos === b[i].pos && Math.abs(s.height - b[i].height) < 0.5)
}

/** Page index (0-based) of a document position, using the current layout. */
export function pageAtPos(view: EditorView, pos: number, metrics: PageMetrics): number {
  try {
    const coords = view.coordsAtPos(pos)
    const rootRect = view.dom.getBoundingClientRect()
    const rootTop = rootRect.top
    const zoom = view.dom.offsetWidth > 0 ? rootRect.width / view.dom.offsetWidth : 1
    const y = (coords.top - rootTop) / zoom
    return Math.max(0, Math.floor(y / (metrics.textHeight + metrics.gap)))
  } catch {
    return 0
  }
}

/**
 * Visual pagination: after each change, measure the top-level blocks and insert spacer widgets
 * before any block that would straddle a page boundary, so content appears to flow from one
 * page sheet to the next. Blocks taller than a page simply overflow.
 */
export const Pagination = Extension.create<PaginationOptions>({
  name: 'pagination',

  addOptions() {
    return { metrics: { textHeight: 864, gap: 216 }, onLayout: undefined }
  },

  addStorage() {
    return { pages: 1 }
  },

  addProseMirrorPlugins() {
    const ext = this
    let frame = 0
    let passes = 0

    const schedule = (view: EditorView): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const current = paginationKey.getState(view.state)
        const { spacers, pages } = computeSpacers(view, ext.options.metrics)
        if (!current) return
        const changed = !sameSpacers(current.spacers, spacers) || current.pages !== pages
        if (changed && passes < 3) {
          passes += 1
          view.dispatch(view.state.tr.setMeta(SET_SPACERS, { spacers, pages }).setMeta('addToHistory', false))
        } else {
          passes = 0
        }
      })
    }

    return [
      new Plugin<PluginState>({
        key: paginationKey,
        state: {
          init: (_config, state) => ({ decorations: DecorationSet.empty, spacers: [], pages: 1 }),
          apply: (tr: Transaction, value: PluginState, _old: EditorState, newState: EditorState) => {
            const meta = tr.getMeta(SET_SPACERS) as { spacers: Spacer[]; pages: number } | undefined
            if (meta) {
              ext.storage.pages = meta.pages
              ext.options.onLayout?.({ pages: meta.pages })
              return { spacers: meta.spacers, pages: meta.pages, decorations: buildDecorations(newState, meta.spacers) }
            }
            if (tr.docChanged) {
              return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) }
            }
            return value
          }
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.decorations ?? null
        },
        view: (view) => {
          schedule(view)
          const ro = new ResizeObserver(() => schedule(view))
          ro.observe(view.dom)
          return {
            update: (v, prevState) => {
              if (v.state.doc !== prevState.doc) schedule(v)
            },
            destroy: () => {
              ro.disconnect()
              if (frame) cancelAnimationFrame(frame)
            }
          }
        }
      })
    ]
  }
})

/** Force a re-layout (e.g. after the page setup or zoom changes). */
export function relayout(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(SET_SPACERS, { spacers: [], pages: 1 }).setMeta('addToHistory', false))
}
