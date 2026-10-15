# Quill Cloud — how sync and Claude access work

Quill is local-first. Cloud is an opt-in layer that keeps copies of chosen documents on a
server you run, so they can be opened on another Mac and so Claude can read and edit them
through MCP while every Mac is off. This document is the contract between the app, the
server and Claude. The design canvas with every screen is linked from the README.

## Parts

| Part | Where | Role |
|---|---|---|
| Quill (Electron) | the Mac | Edits `.docx` on disk. All network work is in the main process (`src/main/cloud/`); the renderer only sees `CloudState` and `CloudRow[]` over IPC. |
| Quill Cloud (`server/`) | your machine | One Node process: SQLite + files, the desktop API, the OAuth 2.1 authorisation server, the MCP endpoint. Reuses Quill's own `.docx` engine (`src/main/docx`) so Claude's edits round-trip like the app's. |
| Claude | anywhere | A client of the MCP endpoint with a token you can revoke. |

The shared types live in `src/shared/cloud.ts`.

## Rules the product follows

1. **Local first.** A save writes the file to disk, then uploads in the background. If the
   upload fails the document is marked *Waiting to upload* and retried; nothing blocks.
2. **Nothing downloads on its own.** The start screen lists the whole library under *Cloud*
   with a status glyph per row; a document comes to this Mac only when you open or download it.
3. **Every save is a new version.** The server keeps the newest 30 per document. Claude's
   edits, your saves and restores all append; nothing is overwritten in place.
4. **One question, ever.** When you open a document and the cloud holds a newer version,
   Quill asks *Fetch Newer Version* or *Keep Mine*. Keep Mine opens the local copy and the
   next save becomes the newest version (the other one stays in history). While a document
   is open, a cloud change only lights the status-bar pill.
5. **Sealed accounts.** Every request carries a token naming one account; every query is
   scoped to it. Someone else's document id answers 404, the same as a made-up id. Tests
   in `server/tests/isolation.test.ts` and `server/tests/mcp.test.ts` enforce this per endpoint and per tool.
6. **Claude gets what the person approved.** Scopes are `documents:read` and `documents:write`;
   the consent page lists what is and is not included. Disconnect from Cloud settings revokes
   the grant immediately.

## Sync protocol

- `GET /api/v1/changes?since=<cursor>` returns the documents touched after the cursor,
  coalesced to one entry per document with its current manifest (`CloudDoc`), plus the new
  cursor. The cursor is the server's change-log sequence number.
- `GET /api/v1/changes/stream` is a Server-Sent Events stream of `change` events. Quill
  re-fetches `/changes` on each event; missed events cost nothing because `/changes` is
  cumulative. A 60 s poll covers the stream being down.
- Uploads: `POST /documents` (new) or `POST /documents/:id/versions` (new version) with the
  `.docx` body, `X-Quill-Name`/`X-Quill-Path` and an informational `X-Quill-Base-Version`.
  The server always accepts and makes it the newest version.
- Downloads: `GET /documents/:id/versions/:n/content`, `ETag` = SHA-256.
- The Mac's index (`<userData>/cloud.json`) maps document ids to local paths and the version
  the local copy came from. Status per row: `cloud-only`, `synced`, `newer-on-cloud`,
  `pending-upload`; files outside the index are `local-only`.

## Sign-in and tokens

- The server is an OAuth 2.1 authorisation server (metadata at
  `/.well-known/oauth-authorization-server`, dynamic registration, PKCE S256 only).
  Identity comes from Google (`openid email profile`); the server keeps only the Google
  subject, email and name.
- The desktop app is the built-in public client `quill-desktop` with a loopback redirect on
  any port (RFC 8252). Tokens are stored with Electron `safeStorage` (the macOS keychain).
- Access tokens are 1-hour EdDSA JWTs; refresh tokens are opaque, rotated on use, and a
  replayed refresh token revokes its whole grant.
- Claude registers itself dynamically, sends the user through the same Google login and a
  consent page, and holds its own grant, listed under *Connected apps*.

## MCP tools

`list_documents`, `get_document` (markdown / outline / json), `create_document`,
`replace_text`, `insert_blocks`, `replace_blocks`, `replace_section`, `list_versions`,
`restore_version`. Writes take an optional `expectedVersion` so a stale edit fails instead
of clobbering, and a `note` that appears in version history and in Quill's newer-version
sheet. The endpoint is stateless Streamable HTTP at `/mcp`.

## Threat model, briefly

- The server's owner can read the files on its disk, as with any hosted service; full-disk
  encryption on the machine covers theft. End-to-end encryption is incompatible with
  server-side editing for Claude and is not attempted.
- Tailscale Funnel terminates TLS; the server binds to loopback only.
- Registration is rate-limited; redirect URIs must be https or loopback; codes are
  single-use and expire in five minutes; tokens are bound to a grant that can be revoked.

## Server dependencies, and why each is there

| Package | Why |
|---|---|
| `hono` + `@hono/node-server` | Router, cookies, Server-Sent Events, Web-standard Request/Response (what the MCP transport expects); `app.request()` lets tests run without a socket. |
| `@modelcontextprotocol/sdk` | The MCP protocol and its Streamable HTTP transport; its client is used in tests. Its registration schema validates dynamic client registration. |
| `zod` | Required by the MCP SDK for tool input schemas. |
| `jose` | Signs and verifies the server's Ed25519 access tokens and verifies Google's `id_token`. |
| `happy-dom` | The DOM `@tiptap/html/server` needs to turn imported HTML into editor JSON on the server. |
| `node:sqlite` (built in) | No native build step on Windows. |
| `esbuild` (dev) | Bundles the server and the shared docx engine into one file, so the Windows box needs only Node. |

Not used: an ORM, Express, Passport, dotenv (`node --env-file`), any hosted auth service, Docker.
