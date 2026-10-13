# Quill

A macOS word processor that saves real `.docx` files. Electron + TipTap (ProseMirror), no network, no telemetry, no AI.

Quill follows the Quill design canvas: start screen with recent files, a document window with a Full (tabs + ribbon) or Simple toolbar, paginated US Letter / A4 page sheets, an outline sidebar, a status bar with zoom, and export / unsaved-changes sheets. Light and dark mode follow the macOS appearance.

## Requirements

- macOS on Apple Silicon (the packaged app targets arm64)
- Node.js 20 or newer and npm

## Setup

```bash
npm install
```

## Run in development

```bash
npm run dev
```

This starts the Vite dev server for the renderer and launches Electron. Main-process and preload sources are rebuilt on change with `npx electron-vite dev -w`.

## Test

```bash
npm test
```

Vitest covers the TipTap JSON → docx converter (`tests/docxBuild.test.ts`) and a full round trip that builds a document with every supported element, writes it to `.docx`, imports it again and asserts that structure and formatting survive (`tests/roundTrip.test.ts`).

```bash
npm run typecheck
```

## Build and package

```bash
npm run build     # compiles main, preload and renderer into out/
npm run dist      # builds and packages release/Quill-<version>-arm64.dmg
```

electron-builder signs the app with whatever Apple Development identity is in your keychain (or leaves it unsigned if there is none) and does not notarise it. To run it on another Mac the first time, right-click the app and choose Open, or clear the quarantine attribute with `xattr -d com.apple.quarantine /Applications/Quill.app`.

## Project layout

| Folder | Contents |
|---|---|
| `src/main/` | Electron main process: window, native menu, file dialogs, IPC handlers, recent files, PDF export |
| `src/main/docx/` | `build.ts` (TipTap JSON → docx), `import.ts` + `importPrepass.ts` + `importStyleMap.ts` (docx → TipTap JSON via mammoth), `styles.ts`, `marks.ts` |
| `src/preload/` | `contextBridge` exposing the typed `window.quill` API; context isolation on, node integration off |
| `src/renderer/` | React UI: start screen, editor canvas with visual pagination, toolbars, popovers, sheets, sidebar, status bar |
| `src/shared/` | IPC types and channel names, page geometry, and the document schema (TipTap extensions shared by the editor and the importer) |
| `tests/` | Vitest suites and the sample document fixture |
| `docs/PLAN.md` | The implementation plan, including the TipTap → docx mapping table |

## How documents map to .docx

Inline formatting covers bold, italic, underline, strikethrough, subscript, superscript, font family, font size, text colour and highlight. Paragraph styles map to Word's built-in style ids (`Title`, `Heading1`–`Heading3`, `Quote`), so Word's navigation pane and table of contents work. Lists use real numbering definitions (bullets cycle • ◦ ▪, numbers cycle 1. a. i.), each top-level numbered list restarts at 1. Tables carry a repeating header row, merged cells (`gridSpan` / `vMerge`) and column widths. Images are embedded as media parts. Links are external hyperlinks with the `Hyperlink` character style. Page size and margins are written to the section properties and read back on open.

On import, mammoth converts the structure. Because mammoth's document model has no text colour, a pre-pass tags coloured or shaded runs with synthetic character styles and records picture sizes, and a generated style map carries alignment, indentation, font family, font size and highlight through to the HTML, which the renderer parses with the editor schema.

## Keyboard shortcuts

⌘N new · ⌘O open · ⌘S save · ⇧⌘S save as · ⇧⌘E export sheet · ⌘P export as PDF · ⌘W close · ⌘B / ⌘I / ⌘U bold / italic / underline · ⌘Z / ⇧⌘Z undo / redo · ⌘K link · ⌘= / ⌘- / ⌘0 zoom · ⌥⌘0–3 Body / Heading 1–3 · Tab / ⇧Tab indent / outdent

## Known limitations

- **Pagination is visual.** Blocks are pushed to the next page when they would straddle a boundary; a block taller than a page simply overflows, and there is no widow/orphan control. Tables are not split across pages.
- **One document window at a time.** New or Open replaces the current document (after the unsaved-changes prompt).
- **Import keeps what the editor can show.** Headers and footers, footnotes, comments, text boxes, shapes, charts, tracked changes, columns and section breaks are dropped. Heading levels 4–6 become Heading 3.
- **Highlight colours** outside Word's 16 named highlights are written as run shading; they reopen in Quill as highlights with the exact colour, but Word shows them as shading.
- **Images** are embedded as PNG, JPEG or GIF only; there are no resize handles yet.
- **Fonts.** The bundled document font is Source Serif 4; other choices in the font picker rely on fonts installed on the Mac.
- **Ribbon controls** for non-MVP features (Review, References, most of Insert and Layout, Find/Replace, formatting marks, table styles) are shown as in the design but disabled.
- **PDF export** uses Chromium's print engine with the chosen paper size and margins; hyperlinks are preserved but there are no PDF bookmarks.
- The app is not notarised; signing uses whatever Apple Development identity is available locally.
