# Quill — a free Word alternative for macOS

Quill is a free, open-source word processor for the Mac. It opens and saves real `.docx` files that work in Microsoft Word, Pages and Google Docs, exports PDF, and runs entirely on your machine: no account, no telemetry, no AI.

Optionally, **Quill Cloud** keeps copies of the documents you choose on a server *you* run, so they open on any Mac and **Claude** can read and edit them through MCP, even while your Mac is off. It is off until you turn it on, and the server is one file on a spare machine. See [Cloud and Claude](#cloud-and-claude-optional-self-hosted).

**[Download the latest release](https://github.com/harshramani00/quill/releases/latest)** (Apple Silicon `.dmg`)

Built with Electron and TipTap (ProseMirror).

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

## Installing a downloaded build

The release builds are not notarised with Apple (that needs a paid Developer ID). macOS will therefore warn the first time. After dragging Quill to Applications, either right-click the app and choose **Open**, or run:

```bash
xattr -d com.apple.quarantine /Applications/Quill.app
```

Builds you make yourself with `npm run dist` are signed with whatever Apple Development identity is in your keychain, or left unsigned if there is none.

## Cloud and Claude (optional, self-hosted)

With Cloud off, Quill is exactly the local app described above. With it on:

- The start screen gains **Cloud** (every document in your library, with a status glyph: not on this Mac, up to date, newer version on cloud, waiting to upload) and **On this Mac** (local files, with *Upload to Cloud*). Nothing is downloaded until you open or download it.
- Every save becomes a new version on the server (the last 30 are kept), so nothing you or Claude write is ever overwritten. The status bar shows *Saved to cloud*, and lights up when the cloud holds a newer version.
- The only question Quill ever asks is on open, when the cloud is ahead: **Fetch Newer Version** or **Keep Mine**. Keep Mine opens your copy, and your next save becomes the newest version.
- **Claude** connects to the same server as an MCP connector (phone, web or desktop). It can list, read, create and edit your cloud documents, each edit a new version with a note. You approve exactly what it may do and can disconnect it from Cloud settings at any time.
- Accounts are sealed off from one another. Friends sign in with Google and get their own library on your server; nobody can see anyone else's documents.

Turn it on from the start screen (**Turn on Cloud…**): enter your server address, continue with Google, confirm the folder, and copy the connector address for Claude. Settings live under **File › Cloud Settings…** (⌘,).

The server (`server/`) is a single Node file that runs on a spare Windows machine, reachable from anywhere through Tailscale Funnel at no cost. Setup, backups and the Google sign-in steps are in [server/deploy/README.md](server/deploy/README.md); the protocol and isolation rules are in [docs/CLOUD.md](docs/CLOUD.md).

Try the whole thing locally without Google: `QUILL_DEV_LOGIN=1 npm run server:dev`, then use `http://127.0.0.1:8787` as the server address in Quill. Server tests: `npm run server:test`.

The app bundle gains no new dependencies for this; all network code is in the main process using Node's `fetch`, `http`, `crypto` and Electron's `safeStorage`. The server's few dependencies (`hono`, `@modelcontextprotocol/sdk`, `zod`, `jose`, `happy-dom`) are justified in [docs/CLOUD.md](docs/CLOUD.md) and stay out of the dmg.

## Releasing

Every push to `main` runs tests and typechecks (app and server). When `package.json`'s version has no matching `v<version>` tag yet, the Release workflow also builds the dmg on a macOS runner, bundles the server into `quill-cloud-server.mjs`, and publishes a GitHub release with both. So to ship: bump the version, merge to `main`, and the release appears a few minutes later. Merges that keep the same version only run the checks.

Add these repository secrets to get signed and notarised builds instead of ad-hoc signed ones: `CSC_LINK` and `CSC_KEY_PASSWORD` (Developer ID certificate as a base64 `.p12`), `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## Project layout

| Folder | Contents |
|---|---|
| `src/main/` | Electron main process: window, native menu, file dialogs, IPC handlers, recent files, PDF export |
| `src/main/docx/` | `build.ts` (TipTap JSON → docx), `import.ts` + `importPrepass.ts` + `importStyleMap.ts` (docx → TipTap JSON via mammoth), `styles.ts`, `marks.ts` |
| `src/main/cloud/` | Sync engine: sign-in through the browser, encrypted tokens, the local index, uploads after save, downloads, the change stream |
| `server/` | Quill Cloud: SQLite + document versions, desktop API, OAuth 2.1 + Google sign-in, MCP endpoint with the editing tools; `deploy/` for Windows |
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
- **Cloud** has no sharing between accounts and no merging: when two copies diverge, the later save wins and the other stays in version history. Claude's Markdown covers headings, paragraphs, lists, tables and basic inline formatting; images and page breaks are kept but not authored.
- The app is not notarised; signing uses whatever Apple Development identity is available locally.
