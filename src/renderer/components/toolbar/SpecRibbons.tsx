import type { Editor } from '@tiptap/core'
import type { ReactNode } from 'react'
import { MARGINS, PAPER } from '../../../shared/pageSetup'
import type { MarginPreset, PaperSize } from '../../../shared/pageSetup'
import { insertImageFromDisk } from '../../editor/commands'
import type { ToolbarState } from '../../editor/useToolbarState'
import { clampZoom, setState, useDocState } from '../../state/documentStore'
import type { IconName } from '../icons'
import { Anchor, Menu, MenuItem, usePopover } from '../popovers/Menu'
import { LinkButton, TableInsertButton } from './FormatControls'
import { RBig, RChecks, RFields, RGroup, RSmall, RSmalls, Ribbon } from './Ribbon'

/* Insert ---------------------------------------------------------------- */

export function InsertRibbon({ editor, state }: { editor: Editor; state: ToolbarState }): ReactNode {
  const chain = () => editor.chain().focus()
  return (
    <Ribbon label="Insert">
      <RGroup label="Pages">
        <RBig label="Cover Page" icon="rb-cover" disabled />
        <RBig label="Blank Page" icon="rb-blank" onClick={() => chain().setPageBreak().run()} />
        <RBig label="Page Break" icon="rb-pbreak" onClick={() => chain().setPageBreak().run()} />
      </RGroup>
      <RGroup label="Tables">
        <TableInsertButton editor={editor} big />
      </RGroup>
      <RGroup label="Illustrations">
        <RBig label="Pictures" icon="rb-picture" onClick={() => void insertImageFromDisk(editor)} />
        <RBig label="Shapes" icon="rb-shapes" disabled />
        <RBig label="Icons" icon="rb-icons" disabled />
        <RBig label="Chart" icon="rb-chart" disabled />
      </RGroup>
      <RGroup label="Links">
        <LinkButton editor={editor} state={state} big />
        <RSmalls>
          <RSmall label="Bookmark" icon="rb-bookmark" disabled />
          <RSmall label="Cross-reference" icon="rb-xref" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Comments">
        <RBig label="Comment" icon="rb-comment" disabled />
      </RGroup>
      <RGroup label="Header & Footer">
        <RBig label="Header" icon="rb-header" disabled />
        <RBig label="Footer" icon="rb-footer" disabled />
        <RBig label="Page Number" icon="rb-pagenum" disabled />
      </RGroup>
      <RGroup label="Text">
        <RBig label="Text Box" icon="rb-textbox" disabled />
        <RSmalls>
          <RSmall label="Date & Time" icon="rb-date" onClick={() => chain().insertContent(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })).run()} />
          <RSmall label="Drop Cap" icon="rb-dropcap" disabled />
          <RSmall label="Horizontal Line" icon="rb-pbreak" onClick={() => chain().setHorizontalRule().run()} />
        </RSmalls>
      </RGroup>
      <RGroup label="Symbols">
        <RBig label="Equation" glyph="π" disabled />
        <RBig label="Symbol" glyph="Ω" disabled />
      </RGroup>
    </Ribbon>
  )
}

/* Layout ---------------------------------------------------------------- */

function ChoiceBig<T extends string>({ label, icon, options, value, onPick }: { label: string; icon: IconName; options: { value: T; label: string; hint?: string }[]; value: T; onPick: (v: T) => void }): ReactNode {
  const pop = usePopover()
  return (
    <Anchor pop={pop}>
      <RBig label={label} icon={icon} pressed={pop.open} onClick={pop.toggle} />
      {pop.open ? (
        <Menu label={label}>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              role="menuitemradio"
              checked={o.value === value}
              shortcut={o.hint}
              onSelect={() => {
                pop.setOpen(false)
                onPick(o.value)
              }}
            >
              {o.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </Anchor>
  )
}

export function LayoutRibbon({ editor, state }: { editor: Editor; state: ToolbarState }): ReactNode {
  const pageSetup = useDocState((s) => s.pageSetup)
  const indent = Number(editor.getAttributes(state.style === 'body' ? 'paragraph' : 'heading').indent) || 0
  return (
    <Ribbon label="Layout">
      <RGroup label="Page Setup">
        <ChoiceBig
          label="Margins"
          icon="rb-margins"
          value={pageSetup.margins}
          options={(Object.keys(MARGINS) as MarginPreset[]).map((m) => ({ value: m, label: MARGINS[m].label, hint: MARGINS[m].hint }))}
          onPick={(m) => setState({ pageSetup: { ...pageSetup, margins: m } })}
        />
        <RBig label="Orientation" icon="rb-orient" disabled />
        <ChoiceBig
          label="Size"
          icon="rb-size"
          value={pageSetup.paper}
          options={(Object.keys(PAPER) as PaperSize[]).map((p) => ({ value: p, label: PAPER[p].label, hint: PAPER[p].hint }))}
          onPick={(p) => setState({ pageSetup: { ...pageSetup, paper: p } })}
        />
        <RBig label="Columns" icon="rb-columns" disabled />
        <RSmalls>
          <RSmall label="Breaks" icon="rb-pbreak" onClick={() => editor.chain().focus().setPageBreak().run()} />
          <RSmall label="Line Numbers" icon="rb-linenum" disabled />
          <RSmall label="Hyphenation" glyph="a-" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Indent">
        <RFields fields={[{ label: 'Left', value: `${indent * 0.5} in` }, { label: 'Right', value: '0 in' }]} />
      </RGroup>
      <RGroup label="Spacing">
        <RFields fields={[{ label: 'Before', value: '0 pt' }, { label: 'After', value: '8 pt' }]} />
      </RGroup>
      <RGroup label="Line Spacing">
        <RFields fields={[{ label: 'Line', value: '1.15' }, { label: 'Paper', value: PAPER[pageSetup.paper].label }]} />
      </RGroup>
      <RGroup label="Arrange">
        <RBig label="Position" icon="rb-position" disabled />
        <RBig label="Wrap Text" icon="rb-wrap" disabled />
        <RSmalls>
          <RSmall label="Bring Forward" icon="rb-forward" disabled />
          <RSmall label="Send Backward" icon="rb-backward" disabled />
          <RSmall label="Align" icon="rb-position" disabled />
        </RSmalls>
      </RGroup>
    </Ribbon>
  )
}

/* References ------------------------------------------------------------ */

export function ReferencesRibbon(): ReactNode {
  return (
    <Ribbon label="References">
      <RGroup label="Table of Contents">
        <RBig label="Table of Contents" icon="rb-toc" disabled />
        <RSmalls>
          <RSmall label="Update Table" icon="rb-update" disabled />
          <RSmall label="Add Text" icon="rb-toc" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Footnotes">
        <RBig label="Insert Footnote" glyph="ab¹" disabled />
        <RSmalls>
          <RSmall label="Insert Endnote" glyph="i" disabled />
          <RSmall label="Next Footnote" icon="rb-next" disabled />
          <RSmall label="Show Notes" icon="rb-draft" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Citations">
        <RBig label="Insert Citation" icon="rb-cite" disabled />
        <RBig label="Bibliography" icon="rb-biblio" disabled />
        <RFields fields={[{ label: 'Style', value: 'APA' }]} />
      </RGroup>
      <RGroup label="Captions">
        <RBig label="Insert Caption" icon="rb-caption" disabled />
        <RSmalls>
          <RSmall label="Table of Figures" icon="rb-toc" disabled />
          <RSmall label="Cross-reference" icon="rb-xref" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Index">
        <RBig label="Mark Entry" icon="rb-bookmark" disabled />
        <RBig label="Insert Index" icon="rb-toc" disabled />
      </RGroup>
    </Ribbon>
  )
}

/* Review ---------------------------------------------------------------- */

export function ReviewRibbon({ words, characters }: { words: number; characters: number }): ReactNode {
  return (
    <Ribbon label="Review">
      <RGroup label="Proofing">
        <RBig label="Spelling & Grammar" icon="rb-spell" disabled />
        <RSmalls>
          <RSmall label="Thesaurus" icon="rb-thesaurus" disabled />
          <RSmall label={`${words.toLocaleString()} words · ${characters.toLocaleString()} characters`} icon="rb-count" disabled />
          <RSmall label="Language" icon="rb-lang" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Comments">
        <RBig label="New Comment" icon="rb-comment" disabled />
        <RSmalls>
          <RSmall label="Delete" icon="rb-trash" disabled />
          <RSmall label="Previous" icon="rb-prev" disabled />
          <RSmall label="Next" icon="rb-next" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Tracking">
        <RBig label="Track Changes" icon="rb-track" disabled />
        <RSmalls>
          <RSmall label="All Markup" icon="rb-draft" disabled />
          <RSmall label="Show Markup" icon="rb-comment" disabled />
          <RSmall label="Reviewing Pane" icon="rb-pane" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Changes">
        <RBig label="Accept" icon="rb-accept" disabled />
        <RBig label="Reject" icon="rb-reject" disabled />
        <RSmalls>
          <RSmall label="Previous" icon="rb-prev" disabled />
          <RSmall label="Next" icon="rb-next" disabled />
        </RSmalls>
      </RGroup>
      <RGroup label="Compare">
        <RBig label="Compare" icon="rb-compare" disabled />
      </RGroup>
      <RGroup label="Protect">
        <RBig label="Restrict Editing" icon="rb-lock" disabled />
      </RGroup>
    </Ribbon>
  )
}

/* View ------------------------------------------------------------------ */

export function ViewRibbon(): ReactNode {
  const { navVisible, rulerVisible, zoom } = useDocState((s) => ({ navVisible: s.navVisible, rulerVisible: s.rulerVisible, zoom: s.zoom }))
  return (
    <Ribbon label="View">
      <RGroup label="Views">
        <RBig label="Print Layout" icon="rb-printlayout" on />
        <RBig label="Web Layout" icon="rb-web" disabled />
        <RBig label="Focus" icon="rb-focus" disabled />
        <RBig label="Read Mode" icon="rb-read" disabled />
        <RBig label="Outline" icon="rb-outline" disabled />
      </RGroup>
      <RGroup label="Show">
        <RChecks
          checks={[
            { label: 'Ruler', on: rulerVisible, onChange: (v) => setState({ rulerVisible: v }) },
            { label: 'Gridlines', on: false },
            { label: 'Navigation Pane', on: navVisible, onChange: (v) => setState({ navVisible: v }) }
          ]}
        />
      </RGroup>
      <RGroup label="Zoom">
        <RBig label="Zoom" icon="rb-zoom" onClick={() => setState({ zoom: clampZoom(zoom + 10) })} />
        <RBig label="100%" icon="rb-onepage" on={zoom === 100} onClick={() => setState({ zoom: 100 })} />
        <RSmalls>
          <RSmall label="One Page" icon="rb-onepage" onClick={() => setState({ zoom: 60 })} />
          <RSmall label="Multiple Pages" icon="rb-multipage" disabled />
          <RSmall label="Page Width" icon="rb-pagewidth" onClick={() => setState({ zoom: 125 })} />
        </RSmalls>
      </RGroup>
      <RGroup label="Appearance">
        <RChecks checks={[{ label: 'Dark page in Dark Mode', on: true }, { label: 'Show word count', on: true }, { label: 'Typewriter scrolling', on: false }]} />
      </RGroup>
      <RGroup label="Window">
        <RBig label="New Window" icon="rb-newwin" disabled />
        <RSmalls>
          <RSmall label="Split" icon="rb-split" disabled />
          <RSmall label="Arrange All" icon="rb-multipage" disabled />
        </RSmalls>
      </RGroup>
    </Ribbon>
  )
}
