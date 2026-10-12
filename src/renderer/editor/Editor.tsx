import type { Editor } from '@tiptap/core'
import { EditorContent, useEditorState } from '@tiptap/react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { PageMetricsPx } from '../../shared/pageSetup'
import { TBtn, VSep } from '../components/controls'

export const PAGE_GAP = 24

function findTablePos(editor: Editor): number | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return $from.before(d)
  }
  return null
}

function TableContextToolbar({ editor, innerRef }: { editor: Editor; innerRef: RefObject<HTMLDivElement | null> }): ReactNode {
  const { tablePos, canMerge, canSplit, tick } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ tablePos: findTablePos(e), canMerge: e.can().mergeCells(), canSplit: e.can().splitCell(), tick: e.state.doc })
  })
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (tablePos === null || !innerRef.current) {
      setPos(null)
      return
    }
    const dom = editor.view.nodeDOM(tablePos)
    const el = dom instanceof HTMLElement ? dom : null
    const table = el?.tagName === 'TABLE' ? el : el?.querySelector('table')
    if (!table) {
      setPos(null)
      return
    }
    table.classList.add('is-active-table')
    const rect = table.getBoundingClientRect()
    const inner = innerRef.current.getBoundingClientRect()
    setPos({ left: rect.left - inner.left, top: rect.top - inner.top - 44 })
    return () => table.classList.remove('is-active-table')
  }, [editor, tablePos, tick, innerRef])

  if (tablePos === null || !pos) return null
  const chain = () => editor.chain().focus()
  return (
    <div className="q-ctx" role="toolbar" aria-label="Table" style={{ left: pos.left, top: Math.max(0, pos.top) }}>
      <span className="q-ctx-label">Row</span>
      <TBtn label="Add row above" icon="add-row-above" onClick={() => chain().addRowBefore().run()} />
      <TBtn label="Add row below" icon="add-row-below" onClick={() => chain().addRowAfter().run()} />
      <TBtn label="Delete row" icon="delete-row" onClick={() => chain().deleteRow().run()} />
      <VSep style={{ margin: '0 4px' }} />
      <span className="q-ctx-label">Column</span>
      <TBtn label="Add column left" icon="add-column-left" onClick={() => chain().addColumnBefore().run()} />
      <TBtn label="Add column right" icon="add-column-right" onClick={() => chain().addColumnAfter().run()} />
      <TBtn label="Delete column" icon="delete-column" onClick={() => chain().deleteColumn().run()} />
      <VSep style={{ margin: '0 4px' }} />
      <TBtn label="Merge cells" icon="merge-cells" text="Merge Cells" disabled={!canMerge} onClick={() => chain().mergeCells().run()} />
      {canSplit ? <TBtn label="Split cell" icon="split-cells" text="Split" onClick={() => chain().splitCell().run()} /> : null}
      <VSep style={{ margin: '0 4px' }} />
      <TBtn label="Delete table" icon="delete-table" style={{ color: 'var(--q-destructive)' }} onClick={() => chain().deleteTable().run()} />
    </div>
  )
}

export function EditorCanvas({ editor, metrics, zoom, pages, canvasRef }: { editor: Editor; metrics: PageMetricsPx; zoom: number; pages: number; canvasRef: RefObject<HTMLDivElement | null> }): ReactNode {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const stride = metrics.height + PAGE_GAP
  const vars = {
    '--page-w': `${metrics.width}px`,
    '--page-h': `${metrics.height}px`,
    '--margin-top': `${metrics.top}px`,
    '--margin-bottom': `${metrics.bottom}px`,
    '--margin-left': `${metrics.left}px`,
    '--margin-right': `${metrics.right}px`,
    '--text-w': `${metrics.textWidth}px`,
    '--text-h': `${metrics.textHeight}px`,
    '--zoom': zoom / 100,
    minHeight: pages * stride - PAGE_GAP
  } as CSSProperties
  return (
    <div className="q-canvas" ref={canvasRef}>
      <div className="q-canvas-inner" ref={innerRef} style={{ position: 'relative' }}>
        <div className="q-doc" style={vars}>
          <div className="q-sheets" aria-hidden="true">
            {Array.from({ length: pages }, (_, i) => (
              <div key={i} className="q-page-sheet" style={{ top: i * stride }}>
                <span className="q-page-num">{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="q-editor">
            <EditorContent editor={editor} />
          </div>
        </div>
        <TableContextToolbar editor={editor} innerRef={innerRef} />
      </div>
    </div>
  )
}
