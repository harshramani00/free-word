import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import type { ReactNode } from 'react'
import { TBtn } from '../controls'
import { RBig, RChecks, RCol, RFields, RGroup, RRow, RRows, RSmall, RSmalls, Ribbon } from './Ribbon'

export function TableRibbon({ editor }: { editor: Editor }): ReactNode {
  const can = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      merge: e.can().mergeCells(),
      split: e.can().splitCell(),
      header: e.isActive('tableHeader'),
      toggleHeader: e.can().toggleHeaderRow()
    })
  })
  const chain = () => editor.chain().focus()
  return (
    <Ribbon label="Table">
      <RGroup label="Table">
        <RSmalls>
          <RSmall label="Select" icon="select" onClick={() => chain().selectParentNode().run()} />
          <RSmall label="View Gridlines" icon="view-gridlines" on disabled />
          <RSmall label="Properties" icon="properties" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Rows & Columns">
        <RBig label="Delete" icon="delete-table" onClick={() => chain().deleteTable().run()} />
        <RBig label="Insert Above" icon="add-row-above" onClick={() => chain().addRowBefore().run()} />
        <RBig label="Insert Below" icon="add-row-below" onClick={() => chain().addRowAfter().run()} />
        <RSmalls>
          <RSmall label="Insert Left" icon="add-column-left" onClick={() => chain().addColumnBefore().run()} />
          <RSmall label="Insert Right" icon="add-column-right" onClick={() => chain().addColumnAfter().run()} />
          <RSmall label="Delete Row" icon="delete-row" onClick={() => chain().deleteRow().run()} />
        </RSmalls>
        <RSmalls>
          <RSmall label="Delete Column" icon="delete-column" onClick={() => chain().deleteColumn().run()} />
          <RSmall label="Header Row" icon="rb-header" on={can.header} disabled={!can.toggleHeader} onClick={() => chain().toggleHeaderRow().run()} />
          <RSmall label="Header Cell" icon="rb-table" disabled={!editor.can().toggleHeaderCell()} onClick={() => chain().toggleHeaderCell().run()} />
        </RSmalls>
      </RGroup>
      <RGroup label="Merge">
        <RBig label="Merge Cells" icon="merge-cells" disabled={!can.merge} onClick={() => chain().mergeCells().run()} />
        <RSmalls>
          <RSmall label="Split Cells" icon="split-cells" disabled={!can.split} onClick={() => chain().splitCell().run()} />
          <RSmall label="Split Table" icon="split-table" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Cell Size" gap={14}>
        <RFields fields={[{ label: 'Height', value: 'Auto' }, { label: 'Width', value: 'Auto' }]} />
        <RSmalls>
          <RSmall label="Distribute Rows" icon="distribute-rows" disabled />
          <RSmall label="Distribute Columns" icon="distribute-columns" disabled />
          <RSmall label="AutoFit" icon="autofit" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Alignment">
        <RRows>
          <RRow>
            <TBtn label="Align top" icon="align-top" on disabled />
            <TBtn label="Align middle" icon="align-middle" disabled />
            <TBtn label="Align bottom" icon="align-bottom" disabled />
          </RRow>
          <RRow>
            <TBtn label="Text direction" icon="text-direction" disabled />
            <TBtn label="Cell margins" icon="cell-margins" disabled />
            <TBtn label="Sort" icon="sort" disabled />
          </RRow>
        </RRows>
      </RGroup>
      <RGroup label="Table Style" gap={14}>
        <RCol>
          <RChecks checks={[{ label: 'Header Row', on: true }, { label: 'Total Row', on: false }, { label: 'Banded Rows', on: false }]} />
        </RCol>
        <div style={{ display: 'flex', gap: 6, paddingTop: 4 }}>
          <button type="button" className="q-tblstyle is-on" aria-label="Table style: Plain grid" style={{ border: 0, padding: 0 }} disabled />
          <button type="button" className="q-tblstyle head" aria-label="Table style: Accent header" style={{ border: 0, padding: 0 }} disabled />
          <button type="button" className="q-tblstyle band" aria-label="Table style: Banded" style={{ border: 0, padding: 0 }} disabled />
        </div>
        <RSmalls>
          <RSmall label="Shading" icon="shading" disabled />
          <RSmall label="Borders" icon="borders" disabled />
        </RSmalls>
      </RGroup>
    </Ribbon>
  )
}
