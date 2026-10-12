# Quill — macOS word processor: implementation plan

## Context

Build "Quill", an Electron + TipTap v3 word processor for macOS that saves real `.docx`, imports `.docx`, exports PDF, and matches the Quill design canvas (https://claude.ai/artifact/LrDcxMNupTXjgCc6To3k95) in layout, tokens, components and light/dark mode. No AI, no network, no telemetry. Repo: `https://github.com/harshramani00/free-word.git`, work committed and pushed straight to `main` (no PRs). The working folder `free-word/` is currently empty and not yet a git repo.

Design facts pulled from the canvas (19 artboards + `quill-tokens.css`, 31 KB):
- **Token sheet exists.** `project/quill-tokens.css` already defines every color (light `.q-light` / dark `.q-dark`), UI and document type scales, spacing, radii, layout metrics (title bar 44 px editor / 52 px start, tabs 32, ribbon 96, ruler 22, nav 240, status 28, page 816×1056 Letter / 794×1123 A4, margins 96/48/192, page gap 24) and all component classes (`q-tbtn`, `q-popup`, `q-btn`, `q-seg`, `q-field`, `q-sidebar`/`q-outline`, `q-status`/`q-zoom`, `q-page`/`q-d-*`, `q-ribbon`/`q-rgroup`/`q-rbig`/`q-rsmall`, `q-stylechip`, `q-tabs`/`q-tab`, `q-menu`/`q-fontrow`/`q-chip`, `q-sheet`/`q-scrim`, `q-ctx` floating table toolbar, `q-tpl`/`q-filelist` start screen). It is copied into the renderer almost verbatim; the app only adds ProseMirror-specific selectors.
- **Screens:** Start (left rail + "New" templates row + "Recent" file table), Editor Full mode (title bar → tabs → ribbon → ruler → nav sidebar + paged canvas → status bar), Editor Simple mode (one 44 px row + "All tools"), Font picker popover, Export sheet (Format / Page size / Margins / File name), Unsaved-changes sheet, Table editing (contextual Table tab + ribbon, selected-table outline, floating `q-ctx` toolbar), and reference boards for every other ribbon tab (Insert, Layout, References, Review, View).

Decisions confirmed with the user:
1. **React + `@tiptap/react`** for the renderer.
2. **All six ribbon tabs and the start-rail items are rendered**; controls with no MVP feature behind them are disabled (`is-disabled`, `aria-disabled`).
3. **Source Serif 4 bundled offline** via `@fontsource/source-serif-4` (OFL).
4. **Both Simple and Full toolbar modes**, Full is default, choice persisted.

## Dependencies (and why each extra one is there)

Required by spec: `electron` 44, `vite`, `typescript`, `@tiptap/core` `@tiptap/pm` `@tiptap/starter-kit` (v3 StarterKit already includes Underline, Link, UndoRedo, lists), `@tiptap/extension-text-style` (v3 `TextStyleKit` = TextStyle + Color + FontFamily + FontSize), `@tiptap/extension-highlight`, `@tiptap/extension-text-align`, `@tiptap/extension-table` (v3 `TableKit` = table/row/header/cell), `@tiptap/extension-image`, `@tiptap/extensions` (v3 home of Placeholder and CharacterCount), `docx` 9, `mammoth` 1.13, `electron-builder` 26, `vitest`.

Extras, each justified:
| Package | Why |
|---|---|
| `electron-vite` | One config for main / preload / renderer Vite builds + HMR; avoids three hand-written Vite configs and a dev orchestrator script. |
| `react`, `react-dom`, `@vitejs/plugin-react`, `@tiptap/react` | Agreed UI layer; `@tiptap/react` is TipTap's official binding and gives `useEditorState` for toolbar state. |
| `@tiptap/html` | `generateJSON()` in Node for the import pipeline (HTML → TipTap JSON in the main process) and for Vitest round-trip tests without a browser. |
| `jszip` | Already a transitive dep of `docx`; used directly to read `word/document.xml` + `sectPr` on import (color pre-pass, page setup) and to assert on XML in tests. |
| `@xmldom/xmldom` | DOM parser for Node (main process has no `DOMParser`); used by the import pre-pass. Small, no deps. |
| `@fontsource/source-serif-4` | The design's document font, bundled so there is no runtime network. |

No other runtime packages. No analytics, no auto-update.

## File tree

```
free-word/
├─ package.json                 scripts: dev, build, test, dist, typecheck
├─ electron.vite.config.ts      main / preload / renderer targets
├─ electron-builder.yml         mac arm64 dmg, hardened runtime, docx file association
├─ tsconfig.json  tsconfig.node.json  tsconfig.web.json
├─ vitest.config.ts
├─ build/                       icon.icns, entitlements.mac.plist
├─ README.md                    setup, run, build, known limitations (written last)
├─ docs/PLAN.md                 this plan, committed in the first push
├─ src/
│  ├─ shared/
│  │  ├─ ipc.ts                 channel names + typed request/response payloads
│  │  ├─ types.ts               QuillApi (window.quill), RecentEntry, PageSetup, ExportOptions, SaveResult
│  │  └─ pageSetup.ts           Letter/A4 sizes, margin presets, px⇄twips⇄pt helpers (shared by renderer CSS and docx builder)
│  ├─ main/
│  │  ├─ index.ts               app lifecycle, single window, nativeTheme, open-file (Dock/Finder), quit guard
│  │  ├─ window.ts              BrowserWindow: titleBarStyle 'hiddenInset', trafficLightPosition {20,16}, setDocumentEdited/RepresentedFilename
│  │  ├─ menu.ts                native menu (File/Edit/Format/View/Window/Help) → sends 'menu:action' to renderer
│  │  ├─ ipc.ts                 ipcMain.handle for every channel in shared/ipc.ts
│  │  ├─ recent.ts              userData/recent.json read/write/prune + app.addRecentDocument
│  │  ├─ pdf.ts                 webContents.printToPDF with pageSize/margins from ExportOptions
│  │  └─ docx/
│  │     ├─ build.ts            TipTap JSON → docx Document (pure function, unit-tested)
│  │     ├─ styles.ts           paragraph styles (Title, Heading1–3, Quote, HorizontalRule, Hyperlink char style), numbering configs
│  │     ├─ marks.ts            mark set → TextRun options (color, size, font, highlight/shading)
│  │     ├─ import.ts           Buffer → HTML (mammoth + enrichment) → TipTap JSON (generateJSON) + PageSetup
│  │     ├─ importPrepass.ts    jszip + xmldom: inject color run-styles, read sectPr page size/margins
│  │     └─ importStyleMap.ts   generated mammoth style map + transformDocument tagging
│  ├─ preload/
│  │  └─ index.ts               contextBridge.exposeInMainWorld('quill', …) — typed against shared/types.ts, nothing else exposed
│  └─ renderer/
│     ├─ index.html
│     ├─ main.tsx
│     ├─ App.tsx                route: Start | Editor; theme class on <html>; menu:action dispatcher
│     ├─ state/
│     │  ├─ documentStore.ts    path, title, dirty, json snapshot, pageSetup, zoom, toolbarMode (React context + reducer)
│     │  └─ prefs.ts            toolbarMode, navPaneVisible, rulerVisible (localStorage)
│     ├─ editor/
│     │  ├─ extensions.ts       assembled extension list (shared with tests via import)
│     │  ├─ extensions/
│     │  │  ├─ title.ts         block node `title` (Title paragraph style)
│     │  │  ├─ pageBreak.ts     atom block node `pageBreak`
│     │  │  ├─ indent.ts        `indent` attr (0–8) on paragraph/heading + indent/outdent commands (lists use sink/lift)
│     │  │  └─ pagination.ts    ProseMirror plugin: measures top-level blocks, inserts spacer decorations at page boundaries, exposes page count + caret page
│     │  ├─ Editor.tsx          EditorContent inside paged canvas, zoom transform, page sheets backdrop
│     │  └─ commands.ts         one place for every toolbar/menu command (bold, setStyle, insertTable, …)
│     ├─ components/
│     │  ├─ start/StartScreen.tsx, TemplateRow.tsx, RecentList.tsx
│     │  ├─ chrome/TitleBar.tsx, Tabs.tsx, StatusBar.tsx, Ruler.tsx, Sidebar.tsx (Navigation/outline)
│     │  ├─ toolbar/SimpleToolbar.tsx, ribbon/{Ribbon,HomeRibbon,TableRibbon,InsertRibbon,LayoutRibbon,ReferencesRibbon,ReviewRibbon,ViewRibbon}.tsx
│     │  ├─ popovers/Menu.tsx (generic q-menu), StylePicker.tsx, FontPicker.tsx, FontSizePicker.tsx, ColorPicker.tsx, LinkPopover.tsx, TableGridPicker.tsx, TableContextToolbar.tsx
│     │  ├─ sheets/ExportSheet.tsx, UnsavedSheet.tsx
│     │  └─ icons.tsx           the 16×16 stroke SVGs from the design, as components
│     └─ styles/
│        ├─ tokens.css          quill-tokens.css from the design (verbatim + @font-face for Source Serif 4)
│        ├─ app.css             layout shell, app-region drag, scrollbars
│        ├─ editor.css          .ProseMirror mapped to .q-page / .q-d-* rules; table selection; placeholder; page-break node
│        └─ print.css           @media print: hide chrome, unwrap page sheets, page-break-before on pageBreak nodes
└─ tests/
   ├─ fixtures/sampleDoc.ts     TipTap JSON containing every supported element
   ├─ docxBuild.test.ts         unit tests: each node/mark → expected OOXML (unzip + xmldom assertions)
   ├─ docxImport.test.ts        unit tests for the enrichment pass (alignment, size, color, highlight, hr, page break)
   └─ roundTrip.test.ts         build → Buffer → import → assert structure + formatting survive
```

## TipTap JSON → docx mapping (`src/main/docx/build.ts`)

Document shell: one `Section` with `page.size` and `page.margin` from `PageSetup` (Letter 12240×15840 twips / A4 11906×16838; margins normal 1440, narrow 720, wide 2880 L/R + 1440 T/B). `styles.default.document.run` = Source Serif 4, 22 half-points (11 pt). Paragraph styles declared with real Word IDs so Word's navigation pane works: `Title`, `Heading1`, `Heading2`, `Heading3`, `Quote`, plus `HorizontalRule` (empty paragraph with bottom border) and the `Hyperlink` character style. Two numbering definitions, 9 levels each: `bullets` (•, ◦, ▪ cycling, `LevelFormat.BULLET`) and `numbers` (decimal / lowerLetter / lowerRoman cycling); every top-level `orderedList` gets its own `numbers-<n>` instance so numbering restarts.

| TipTap node / mark | docx |
|---|---|
| `doc` | `Document` → one `Section` |
| `paragraph` {textAlign, indent} | `Paragraph({ alignment, indent: { left: indent·720 } , children })` |
| `title` | `Paragraph({ heading: HeadingLevel.TITLE })` |
| `heading` level 1–3 {textAlign} | `Paragraph({ heading: HEADING_1/2/3, alignment })` |
| `blockquote` → its paragraphs | `Paragraph({ style: 'Quote' })` per child |
| `bulletList` / `orderedList` / `listItem` (nested) | flattened: each `listItem` paragraph → `Paragraph({ numbering: { reference, level } })`, `level` = nesting depth; non-paragraph children (nested lists) recurse with depth+1 |
| `horizontalRule` | `Paragraph({ style: 'HorizontalRule' })` (bottom border single 6/8 pt) |
| `pageBreak` | `Paragraph({ children: [new PageBreak()] })` |
| `hardBreak` | `TextRun({ break: 1 })` |
| `image` {src data-URL, width, height, alt} | `Paragraph({ children: [ImageRun({ type: png/jpg, data: Buffer, transformation: { width, height }, altText })] })`; width capped at text width |
| `table` / `tableRow` / `tableHeader` / `tableCell` {colspan,rowspan, colwidth} | `Table({ rows: TableRow[], width 100% pct, columnWidths })`; cell → `TableCell({ columnSpan, rowSpan, shading for header, children: block[] })`; `rowSpan` lets `docx` emit `vMerge` continuations |
| `text` + marks | `TextRun` (or `ExternalHyperlink` wrapper when `link` mark is present, `link.href` → `link`, run style `Hyperlink`) |
| mark `bold` / `italic` / `underline` / `strike` | `bold`, `italics`, `underline: {}`, `strike` |
| mark `textStyle.color` | `color: 'RRGGBB'` |
| mark `textStyle.fontSize` ("14pt"/"18px") | `size: pt×2` (half-points; px→pt ×0.75) |
| mark `textStyle.fontFamily` | `font: name` |
| mark `highlight.color` | if it is one of Word's 16 highlight names → `highlight`; otherwise `shading: { fill: 'RRGGBB', type: CLEAR }` |
| mark `subscript` / `superscript` | `subScript` / `superScript` |
| mark `code` | `font: 'Menlo'` |

## docx → TipTap import (`src/main/docx/import.ts`)

mammoth does the structural conversion as the spec requires; its model exposes paragraph `alignment`, `indent`, `numbering`, run `font`, `fontSize`, `highlight`, but **not** text color. So:

1. **Pre-pass** (`importPrepass.ts`, jszip + xmldom): for each `w:r` whose `w:rPr` has `w:color`, inject `w:rStyle w:val="qc-RRGGBB"`; read `w:sectPr` → `PageSetup` (size, margins) so the editor opens the document in its own page setup. Re-zip to a Buffer.
2. **mammoth** with `transformDocument` that tags paragraphs/runs with synthetic style ids for alignment (`qa-center`), indent level (`qi-2`), font size (`qs-14`), font family (`qf-Georgia`), highlight (`qh-yellow`), and a **generated style map**: `p[style-name='Title'] => h1.q-title`, `p[style-name='Heading 1'] => h1` … `h3`, `p[style-name='Quote'] => blockquote > p`, `p[style-name='Horizontal Rule'] => hr`, `br[type='page'] => hr.page-break`, `r.qc-RRGGBB => span.qc-RRGGBB`, `r.qs-14 => span.qs-14`, etc. Images come back as data URLs (`convertImage` default), links as `<a href>`, tables with `colspan`/`rowspan`, lists as nested `<ul>/<ol>`.
3. **HTML → JSON** with `generateJSON(html, extensions)` from `@tiptap/html`; the custom extensions' `parseHTML` rules read the classes back into attributes/marks (`span.qc-*` → textStyle.color, `span.qs-*` → fontSize, `p.qa-*` → textAlign, `h1.q-title` → `title`, `hr.page-break` → `pageBreak`). Table header cells: `<th>` from mammoth's first-row detection is not reliable, so the pre-pass also tags rows whose cells carry header shading / `w:tblHeader`.

The round-trip test (`tests/roundTrip.test.ts`) asserts every item in the spec's list: headings, bold/italic/underline/strike, nested lists, alignment, tables (incl. merged cells), images (bytes equal), links, font size, text color.

## Editor behaviour

- **Extensions:** StarterKit (heading levels 1–3, link `openOnClick: false`, `autolink`), TextStyleKit, Highlight `{ multicolor: true }`, TextAlign `{ types: ['heading','paragraph','title'] }`, TableKit `{ table: { resizable: true } }`, Image `{ allowBase64: true, inline: false }`, Placeholder, CharacterCount, custom Title / PageBreak / Indent / Pagination.
- **Paragraph styles:** Body = paragraph, Title = `title` node, H1–H3 = heading, Quote = blockquote. Style chips and the Simple-mode popup both call `commands.setParagraphStyle(style)`.
- **Pagination (visual):** content is one ProseMirror column at page width; a backdrop renders N page sheets (`.q-page` look, `--q-page-gap` apart). After each transaction (debounced on `requestAnimationFrame`) the plugin measures top-level block `getBoundingClientRect`s against page boundaries (`pageHeight − 2·margin`) and sets a widget decoration (spacer whose height = remaining space + gap + bottom/top margins) before the first block that would cross; `pageBreak` forces a spacer. Blocks taller than a page just overflow (documented). Page count and caret page feed the status bar and the "Pages" nav tab.
- **Zoom:** 50–200 %, `transform: scale()` on the page stack with `transform-origin: top center`; slider, ⌘+/⌘−/⌘0, menu.
- **Dirty tracking:** compare `editor.getJSON()` to the last saved snapshot on `update`; sets title "— Edited", `win.setDocumentEdited`, and gates New/Open/close/quit through the Unsaved sheet (renderer-side sheet matching the design; main sends `app:confirm-close`, renderer replies save / discard / cancel).
- **Tables:** Insert via grid picker; contextual Table tab + ribbon and floating `q-ctx` toolbar appear when selection is inside a table; add/delete row/column, merge/split cells, delete table; selected table gets the accent outline.
- **Images:** `dialog.showOpenDialog` (png/jpg/gif/webp) → main reads bytes → data URL into the image node. Simple resize handles are out of scope for MVP.
- **Links:** popover with URL field; ⌘K.
- **Outline sidebar:** derived from the doc on each update (title + headings with positions); click → `editor.commands.focus(pos)` + `scrollIntoView`; current section tracked from caret position. "Pages" tab lists pages from the pagination plugin; "Results" tab is disabled (find is non-MVP).
- **Theme:** `nativeTheme.shouldUseDarkColors` pushed to the renderer on change; `.q-dark` on `<html>`; renderer also listens to `prefers-color-scheme` as fallback.
- **Native menu:** ⌘N, ⌘O, ⌘S, ⇧⌘S, ⌘P (Export as PDF…), ⌘B/I/U, ⌘Z/⇧⌘Z, ⌘+/⌘−/⌘0, ⌘K link, ⇧⌘E export sheet, ⌥⌘0–3 paragraph styles (as shown in the design's style menu), ⌘W close.
- **Start screen:** reads `recent:list`; table columns Name / Location (parent folder breadcrumb) / Last edited (mtime) / Type badge; search filters; grid toggle shows `q-card`s; missing files pruned; "Blank Document" + the six template tiles (templates insert a small starter JSON — Letter, Résumé, Report, Meeting Notes, Newsletter, Flyer — simple text skeletons, no lorem ipsum). Templates/Pinned rail items are rendered and disabled.
- **Export sheet:** Format (docx / PDF), Page size, Margins, File name → `file:saveAs` or `pdf:export`; Page size/margins also update the live page setup.

## Build order (per the spec)

1. **Repo + shell:** `git init`, remote, `.gitignore`, electron-vite scaffold, strict TS, preload bridge with the full `QuillApi` typed surface, tokens.css + fonts, title bar (hiddenInset) and theme switching. Push `docs/PLAN.md` + scaffold.
2. **Editor + toolbar:** extensions, Editor canvas with page backdrop, Home ribbon + Simple toolbar + Tabs + style/font/size/color popovers, Indent, Title, PageBreak.
3. **Save / Open .docx:** `build.ts`, `styles.ts`, `marks.ts`, `import.ts` + pre-pass, IPC + dialogs, dirty tracking, Unsaved sheet, Vitest build + round-trip tests green.
4. **PDF export:** `print.css`, `pdf.ts`, Export sheet.
5. **Tables + images:** TableKit UI (ribbon + floating toolbar), image insert, docx mapping + tests for both.
6. **Outline / status bar / recent files / pagination plugin / ruler.**
7. **Polish to design:** Insert/Layout/References/Review/View ribbons (disabled controls), font picker, start screen templates grid, dark-mode pass against `*Dark` artboards, keyboard focus rings.
8. **Packaging:** `electron-builder.yml` (arm64 dmg, `.docx` document type, entitlements), `npm run dist`, smoke-test the dmg; README with limitations.

Each phase ends with a commit pushed to `main`.

## npm scripts

`dev` = `electron-vite dev` · `build` = `electron-vite build` · `test` = `vitest run` · `typecheck` = `tsc -p tsconfig.web.json && tsc -p tsconfig.node.json` · `dist` = `npm run build && electron-builder --mac --arm64`.

## Verification

- `npm test`: build unit tests + round-trip test (every supported element) pass.
- `npm run dev`: launch; New → type → apply every Home-ribbon control → Save → reopen → formatting intact; Open a Word- or Pages-authored `.docx`; Export PDF opens in Preview with no chrome and correct page size.
- Save a doc with headings/table/image/list/link and open it in **Word, Pages and Google Docs**: no repair prompt, Word navigation pane shows the headings.
- Toggle macOS appearance: UI and page follow; compare against the `*Dark` artboards.
- Unsaved flow: edit → ⌘W / ⌘Q / ⌘O / ⌘N each raise the sheet; Save / Don't Save / Cancel behave.
- `npm run dist` produces `dist/Quill-<version>-arm64.dmg`; installed app launches and opens a `.docx` from Finder.

## Known limitations to record in the README

Visual pagination only (blocks taller than a page overflow; no widow/orphan control); one document window at a time; docx import keeps the spec's list of properties but drops headers/footers, footnotes, comments, text boxes and tracked changes; highlight colors outside Word's 16 names export as shading; images are embedded as PNG/JPEG only; non-MVP ribbon controls are visible but disabled; Find/Replace, spelling, templates beyond skeletons and Pinned are not implemented.
