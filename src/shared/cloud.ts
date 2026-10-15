/**
 * Quill Cloud — the contract shared by the desktop app (renderer + main) and the
 * server. The server's "manifest" of a document is `CloudDoc`; the desktop app
 * decorates it with local state to make a `CloudRow` for the start screen.
 *
 * Deliberately free of imports so every side can pull it in.
 */

/** Who produced a version. */
export type Actor = 'user' | 'claude'

/** A document as the server describes it (its "manifest"). */
export interface CloudDoc {
  id: string
  /** Display name without the .docx extension. */
  name: string
  /** Folder relative to the user's Quill folder, '' for the root; never starts or ends with '/'. */
  path: string
  currentVersion: number
  size: number
  sha256: string
  createdAt: number
  updatedAt: number
  updatedBy: Actor
  note: string | null
  deletedAt: number | null
}

export type ChangeKind = 'version' | 'rename' | 'delete' | 'restore'

export interface Change {
  seq: number
  kind: ChangeKind
  manifest: CloudDoc
}

/** Everything that changed after a cursor, coalesced to one entry per document. */
export interface Changes {
  cursor: number
  changes: Change[]
}

export interface VersionInfo {
  n: number
  size: number
  sha256: string
  createdAt: number
  updatedBy: Actor
  note: string | null
  baseVersion: number | null
}

export interface AccountInfo {
  id: string
  email: string
  name: string
  quotaBytes: number
  usedBytes: number
}

/** An app the user has connected through OAuth (Claude, another Quill install, …). */
export interface ConnectedApp {
  id: string
  clientId: string
  clientName: string
  scope: string
  createdAt: number
  lastUsedAt: number | null
}

export const SCOPE_READ = 'documents:read'
export const SCOPE_WRITE = 'documents:write'
export const ALL_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const

/** The desktop app's built-in OAuth client. Loopback redirects on any port are allowed for it. */
export const DESKTOP_CLIENT_ID = 'quill-desktop'

/** Request headers used when uploading a .docx. */
export const HEADER_NAME = 'x-quill-name'
export const HEADER_PATH = 'x-quill-path'
export const HEADER_NOTE = 'x-quill-note'
export const HEADER_BASE_VERSION = 'x-quill-base-version'

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/* ---------- Desktop-only shapes (renderer ⇄ main) ---------- */

export type LocalSyncStatus = 'cloud-only' | 'synced' | 'newer-on-cloud' | 'pending-upload' | 'local-only'

export interface CloudRow extends CloudDoc {
  localPath: string | null
  localVersion: number | null
  status: LocalSyncStatus
}

export interface CloudAccount extends AccountInfo {
  serverUrl: string
  folder: string
  connectedApps: ConnectedApp[]
}

export interface CloudState {
  enabled: boolean
  account: CloudAccount | null
  online: boolean
  lastSyncAt: number | null
  pendingUploads: number
  /** The MCP connector address to paste into Claude. */
  connectorUrl: string | null
}

/** Attached to an OpenedDocument when the cloud holds a newer version than the local copy. */
export interface NewerOnCloud {
  docId: string
  localVersion: number
  newer: VersionInfo
}
