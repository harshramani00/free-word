import type { Editor } from '@tiptap/core'
import { useEditor, useEditorState } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { pageMetricsPx } from '../shared/pageSetup'
import type { MenuAction } from '../shared/types'
import { Ruler } from './components/chrome/Ruler'
import { Sidebar } from './components/chrome/Sidebar'
import { StatusBar } from './components/chrome/StatusBar'
import { Tabs } from './components/chrome/Tabs'
import { EditorTitleBar, StartTitleBar } from './components/chrome/TitleBar'
import { VersionHistory } from './components/cloud/VersionHistory'
import { CloudSettingsSheet } from './components/sheets/CloudSettingsSheet'
import { CloudSetupSheet } from './components/sheets/CloudSetupSheet'
import { ExportSheet } from './components/sheets/ExportSheet'
import { NewerVersionSheet } from './components/sheets/NewerVersionSheet'
import { UnsavedSheet } from './components/sheets/UnsavedSheet'
import { StartScreen } from './components/start/StartScreen'
import { HomeRibbon } from './components/toolbar/HomeRibbon'
import { SimpleToolbar } from './components/toolbar/SimpleToolbar'
import { InsertRibbon, LayoutRibbon, ReferencesRibbon, ReviewRibbon, ViewRibbon } from './components/toolbar/SpecRibbons'
import { TableRibbon } from './components/toolbar/TableRibbon'
import { EditorCanvas, PAGE_GAP } from './editor/Editor'
import { findNext, insertImageFromDisk, outlineOf, scrollToPos, setAlignment, setParagraphStyle } from './editor/commands'
import { editorExtensions } from './editor/extensions'
import { pageAtPos, relayout } from './editor/extensions/pagination'
import { useToolbarState } from './editor/useToolbarState'
import { cancelSheet, editorRef, exportDocument, exportPdfQuick, fetchNewer, keepMine, markSaved, newDocument, openCloudRow, openDocument, receiveOpenedDocument, requestClose, restoreVersion, runIntent, saveDocument, syncDirty } from './state/actions'
import { startCloudStore, useCloud } from './state/cloudStore'
import { EMPTY_DOC, clampZoom, getState, setState, useDocState } from './state/documentStore'
import { BLANK } from './components/start/templates'

function useTheme(): void {
  useEffect(() => {
    const apply = (theme: 'light' | 'dark'): void => {
      document.documentElement.classList.toggle('q-dark', theme === 'dark')
      document.documentElement.classList.toggle('q-light', theme !== 'dark')
    }
    void window.quill.getTheme().then(apply)
    return window.quill.onTheme(apply)
  }, [])
}

/** Dispatches native menu actions to the store / editor. */
function handleMenu(action: MenuAction, openExport: () => void, focusSearch: () => void): void {
  const editor = editorRef.current
  const s = getState()
  switch (action) {
    case 'file:new':
      newDocument(BLANK)
      return
    case 'file:open':
      void openDocument()
      return
    case 'file:close':
      requestClose('close')
      return
    case 'file:export':
      if (s.screen === 'editor') openExport()
      return
    case 'file:exportPdf':
      if (s.screen === 'editor') exportPdfQuick()
      return
    case 'view:zoomIn':
      setState({ zoom: clampZoom(s.zoom + 10) })
      return
    case 'view:zoomOut':
      setState({ zoom: clampZoom(s.zoom - 10) })
      return
    case 'view:zoomReset':
      setState({ zoom: 100 })
      return
    case 'view:toggleNav':
      setState({ navVisible: !s.navVisible })
      return
    case 'view:toggleRuler':
      setState({ rulerVisible: !s.rulerVisible })
      return
    case 'view:toolbarSimple':
      setState({ toolbarMode: 'simple' })
      return
    case 'view:toolbarFull':
      setState({ toolbarMode: 'full' })
      return
    case 'cloud:settings':
      setState({ sheet: { kind: 'cloudSettings' } })
      return
    case 'cloud:history':
      if (s.screen === 'editor') setState({ historyOpen: true })
      return
    default:
      break
  }
  if (!editor || s.screen !== 'editor') return
  const chain = editor.chain().focus()
  switch (action) {
    case 'file:save':
      void saveDocument()
      break
    case 'file:saveAs':
      void saveDocument({ as: true })
      break
    case 'edit:undo':
      if (document.activeElement instanceof HTMLInputElement) document.execCommand('undo')
      else chain.undo().run()
      break
    case 'edit:redo':
      if (document.activeElement instanceof HTMLInputElement) document.execCommand('redo')
      else chain.redo().run()
      break
    case 'edit:link':
      focusSearch()
      break
    case 'format:bold':
      chain.toggleBold().run()
      break
    case 'format:italic':
      chain.toggleItalic().run()
      break
    case 'format:underline':
      chain.toggleUnderline().run()
      break
    case 'format:strike':
      chain.toggleStrike().run()
      break
    case 'format:alignLeft':
      setAlignment(editor, 'left')
      break
    case 'format:alignCenter':
      setAlignment(editor, 'center')
      break
    case 'format:alignRight':
      setAlignment(editor, 'right')
      break
    case 'format:alignJustify':
      setAlignment(editor, 'justify')
      break
    case 'format:bulletList':
      chain.toggleBulletList().run()
      break
    case 'format:orderedList':
      chain.toggleOrderedList().run()
      break
    case 'format:indent':
      chain.indent().run()
      break
    case 'format:outdent':
      chain.outdent().run()
      break
    case 'style:body':
      setParagraphStyle(editor, 'body')
      break
    case 'style:title':
      setParagraphStyle(editor, 'title')
      break
    case 'style:h1':
      setParagraphStyle(editor, 'h1')
      break
    case 'style:h2':
      setParagraphStyle(editor, 'h2')
      break
    case 'style:h3':
      setParagraphStyle(editor, 'h3')
      break
    case 'style:quote':
      setParagraphStyle(editor, 'quote')
      break
    case 'insert:table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
      break
    case 'insert:image':
      void insertImageFromDisk(editor)
      break
    case 'insert:hr':
      chain.setHorizontalRule().run()
      break
    case 'insert:pageBreak':
      chain.setPageBreak().run()
      break
    default:
      break
  }
}

/** Sheets that can appear on either screen: the newer-version question, Cloud settings, Cloud setup. */
function CloudSheets(): ReactNode {
  const sheet = useDocState((s) => s.sheet)
  if (sheet?.kind === 'newer') {
    const doc = sheet.doc
    return (
      <NewerVersionSheet
        doc={doc}
        onKeepMine={() => keepMine(doc)}
        onFetch={() => void fetchNewer(doc.cloudNewer!.docId)}
        onHistory={() => {
          keepMine(doc)
          setState({ historyOpen: true })
        }}
      />
    )
  }
  if (sheet?.kind === 'cloudSettings') return <CloudSettingsSheet onDone={() => setState({ sheet: null })} onSetUp={() => setState({ sheet: { kind: 'cloudSetup' } })} />
  if (sheet?.kind === 'cloudSetup') return <CloudSetupSheet onDone={() => setState({ sheet: null })} onCancel={() => setState({ sheet: null })} />
  return null
}

function EditorHost(): ReactNode {
  const { name, dirty, pageSetup, zoom, toolbarMode, activeTab, navVisible, rulerVisible, sheet, pendingContent, loadToken, pageCount, notice, cloudDocId, historyOpen } = useDocState((s) => ({
    cloudDocId: s.cloudDocId,
    historyOpen: s.historyOpen,
    name: s.name,
    dirty: s.dirty,
    pageSetup: s.pageSetup,
    zoom: s.zoom,
    toolbarMode: s.toolbarMode,
    activeTab: s.activeTab,
    navVisible: s.navVisible,
    rulerVisible: s.rulerVisible,
    sheet: s.sheet,
    pendingContent: s.pendingContent,
    loadToken: s.loadToken,
    pageCount: s.pageCount,
    notice: s.notice
  }))
  const metrics = useMemo(() => pageMetricsPx(pageSetup), [pageSetup])
  const paginationMetrics = useMemo(() => ({ textHeight: metrics.textHeight, gap: metrics.bottom + PAGE_GAP + metrics.top }), [metrics])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const searchLabelRef = useRef<HTMLLabelElement | null>(null)
  const cloudRow = useCloud((u) => (cloudDocId ? u.rows.find((r) => r.id === cloudDocId) ?? null : null))

  const editor = useEditor(
    {
      extensions: editorExtensions(paginationMetrics, ({ pages }) => {
        if (getState().pageCount !== pages) setState({ pageCount: pages })
      }),
      content: pendingContent ?? EMPTY_DOC,
      autofocus: 'start',
      editorProps: { attributes: { class: 'ProseMirror', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Document' } },
      // The live instance is bound in the effect below; onCreate may also fire for an instance
      // React discards under StrictMode, so it must not touch shared state.
      onUpdate: ({ editor: e }) => {
        if (editorRef.current === e) syncDirty(e)
      }
    },
    [loadToken]
  )

  // The live instance can change (StrictMode re-mounts, loadToken), so bind to it from an effect
  // rather than relying solely on onCreate.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editorRef.current = editor
    markSaved(editor)
    if (import.meta.env.DEV) (window as unknown as { __quillEditor?: Editor }).__quillEditor = editor
    return () => {
      if (editorRef.current === editor) editorRef.current = null
    }
  }, [editor])

  // Page setup changes: update the pagination plugin's metrics and re-layout.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const ext = editor.extensionManager?.extensions.find((e) => e.name === 'pagination')
    if (ext) {
      ;(ext.options as { metrics: typeof paginationMetrics }).metrics = paginationMetrics
      try {
        relayout(editor.view)
      } catch {
        /* view not mounted yet; the plugin lays out on mount */
      }
    }
  }, [editor, paginationMetrics])

  // Tell main about title/dirty/path so the window title and proxy icon follow.
  const path = useDocState((s) => s.path)
  useEffect(() => {
    window.quill.setDocumentState({ title: name, path, dirty })
  }, [name, path, dirty])

  const tb = useToolbarState(editor)
  const live = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      // While an editor instance is being replaced (new/open) it may not be mounted or fully initialised.
      const count = e.storage.characterCount as { words?: () => number; characters?: () => number } | undefined
      let currentPage = 1
      try {
        currentPage = pageAtPos(e.view, e.state.selection.head, paginationMetrics) + 1
      } catch {
        currentPage = 1
      }
      return {
        outline: outlineOf(e),
        selectionFrom: e.state.selection.from,
        currentPage,
        words: count?.words?.() ?? 0,
        characters: count?.characters?.() ?? 0
      }
    }
  })

  useEffect(() => {
    if (tb.inTable && activeTab !== 'table') setState({ activeTab: 'table' })
    if (!tb.inTable && activeTab === 'table') setState({ activeTab: 'home' })
  }, [tb.inTable, activeTab])

  const openExport = useCallback(() => setState({ sheet: { kind: 'export' } }), [])
  const focusSearch = useCallback(() => searchLabelRef.current?.querySelector('input')?.focus(), [])
  useEffect(() => {
    const run = (a: MenuAction): void => handleMenu(a, openExport, focusSearch)
    if (import.meta.env.DEV) (window as unknown as { __quillMenu?: (a: MenuAction) => void }).__quillMenu = run
    return window.quill.onMenu(run)
  }, [openExport, focusSearch])

  const jumpToPage = (index: number): void => {
    const el = canvasRef.current
    if (!el) return
    el.scrollTo({ top: index * (metrics.height + PAGE_GAP) * (zoom / 100), behavior: 'smooth' })
  }

  const ribbon = (): ReactNode => {
    switch (activeTab) {
      case 'table':
        return <TableRibbon editor={editor} />
      case 'insert':
        return <InsertRibbon editor={editor} state={tb} />
      case 'layout':
        return <LayoutRibbon editor={editor} state={tb} />
      case 'references':
        return <ReferencesRibbon />
      case 'review':
        return <ReviewRibbon words={live.words} characters={live.characters} />
      case 'view':
        return <ViewRibbon />
      default:
        return <HomeRibbon editor={editor} state={tb} onFind={focusSearch} />
    }
  }

  return (
    <div className="q-app">
      <EditorTitleBar
        name={name}
        dirty={dirty}
        canUndo={tb.canUndo}
        canRedo={tb.canRedo}
        toolbarMode={toolbarMode}
        search={search}
        exportOpen={sheet?.kind === 'export'}
        onSave={() => void saveDocument()}
        onUndo={() => editor.chain().focus().undo().run()}
        onRedo={() => editor.chain().focus().redo().run()}
        onToolbarMode={(m) => setState({ toolbarMode: m })}
        onSearch={setSearch}
        onFindNext={(back) => findNext(editor, search, back)}
        onExport={openExport}
        searchRef={(el) => {
          searchLabelRef.current = el
        }}
      />
      {toolbarMode === 'full' ? (
        <>
          <Tabs active={activeTab} inTable={tb.inTable} onSelect={(t) => setState({ activeTab: t })} />
          {ribbon()}
        </>
      ) : (
        <SimpleToolbar editor={editor} state={tb} />
      )}
      <div className="q-work">
        {navVisible ? (
          <Sidebar outline={live.outline} currentPos={live.selectionFrom} pages={pageCount} currentPage={live.currentPage} onJump={(pos) => scrollToPos(editor, pos)} onJumpPage={jumpToPage} onHide={() => setState({ navVisible: false })} />
        ) : null}
        <div className="q-main">
          {toolbarMode === 'full' && rulerVisible ? <Ruler metrics={metrics} zoom={zoom} /> : null}
          <EditorCanvas editor={editor} metrics={metrics} zoom={zoom} pages={pageCount} canvasRef={canvasRef} />
        </div>
      </div>
      <StatusBar page={Math.min(live.currentPage, pageCount)} pages={pageCount} words={live.words} characters={live.characters} zoom={zoom} notice={notice} onZoom={(z) => setState({ zoom: z })} />
      {historyOpen ? (
        <VersionHistory
          row={cloudRow}
          docName={name}
          onClose={() => setState({ historyOpen: false })}
          onFetch={(n) => {
            setState({ historyOpen: false })
            if (cloudDocId) void fetchNewer(cloudDocId, n)
          }}
          onRestore={(n) => {
            if (cloudDocId) void restoreVersion(cloudDocId, n)
          }}
        />
      ) : null}
      <CloudSheets />
      {sheet?.kind === 'export' ? <ExportSheet name={name} pageSetup={pageSetup} onCancel={() => setState({ sheet: null })} onExport={(c) => void exportDocument(c)} /> : null}
      {sheet?.kind === 'unsaved' ? (
        <UnsavedSheet
          name={name}
          onSave={() => {
            const intent = sheet.intent
            void saveDocument().then((ok) => {
              if (ok) void runIntent(intent)
            })
          }}
          onDiscard={() => void runIntent(sheet.intent)}
          onCancel={cancelSheet}
        />
      ) : null}
    </div>
  )
}

function StartHost(): ReactNode {
  useEffect(
    () =>
      window.quill.onMenu((a) =>
        handleMenu(
          a,
          () => undefined,
          () => undefined
        )
      ),
    []
  )
  useEffect(() => {
    window.quill.setDocumentState({ title: 'Quill', path: null, dirty: false })
  }, [])
  return (
    <div className="q-app">
      <StartTitleBar />
      <StartScreen
        onNew={(c) => newDocument(c)}
        onOpen={() => void openDocument()}
        onOpenPath={(p) => void openDocument(p)}
        onOpenRow={(row) => void openCloudRow(row)}
        onTurnOnCloud={() => setState({ sheet: { kind: 'cloudSetup' } })}
        onSettings={() => setState({ sheet: { kind: 'cloudSettings' } })}
      />
      <CloudSheets />
    </div>
  )
}

export function App(): ReactNode {
  useTheme()
  useEffect(() => {
    startCloudStore()
    if (import.meta.env.DEV) (window as unknown as { __quillOpen?: (p: string) => void }).__quillOpen = (p) => void openDocument(p)
  }, [])
  const screen = useDocState((s) => s.screen)
  useEffect(() => window.quill.onOpenDocument((doc) => receiveOpenedDocument(doc)), [])
  useEffect(() => window.quill.onConfirmClose((reason) => requestClose(reason)), [])
  return screen === 'editor' ? <EditorHost /> : <StartHost />
}

export type { Editor }
