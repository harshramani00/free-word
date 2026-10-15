import type { DatabaseSync } from 'node:sqlite'
import type { Actor, ChangeKind, CloudDoc, ConnectedApp, VersionInfo } from '../../../src/shared/cloud'

/*
 * Every query that touches a user's data takes the user id from the caller's
 * token and puts it in the WHERE clause. A document that exists but belongs to
 * someone else is therefore indistinguishable from one that does not exist.
 */

export interface UserRow {
  id: string
  google_sub: string | null
  email: string
  name: string
  created_at: number
  last_login_at: number
}

export interface OAuthClientRow {
  client_id: string
  client_secret_hash: string | null
  client_name: string
  redirect_uris: string[]
  token_endpoint_auth_method: string
  builtin: boolean
  created_at: number
}

export interface LoginState {
  state: string
  nonce: string
  params: Record<string, string>
  userId: string | null
  expiresAt: number
}

export interface AuthCodeRow {
  code_hash: string
  client_id: string
  user_id: string
  redirect_uri: string
  scope: string
  code_challenge: string
  resource: string | null
  expires_at: number
  used_at: number | null
}

export interface GrantRow {
  id: string
  user_id: string
  client_id: string
  client_name: string
  scope: string
  created_at: number
  last_used_at: number | null
  revoked_at: number | null
}

export interface RefreshTokenRow {
  token_hash: string
  grant_id: string
  expires_at: number
  used_at: number | null
  replaced_by: string | null
}

type Row = Record<string, unknown>

const MANIFEST_SELECT = `
  SELECT d.id, d.name, d.path, d.current_version, d.created_at, d.updated_at, d.deleted_at,
         v.size, v.sha256, v.updated_by, v.note
  FROM documents d
  LEFT JOIN versions v ON v.doc_id = d.id AND v.n = d.current_version
`

function toManifest(r: Row): CloudDoc {
  return {
    id: r.id as string,
    name: r.name as string,
    path: r.path as string,
    currentVersion: Number(r.current_version),
    size: Number(r.size ?? 0),
    sha256: (r.sha256 as string | null) ?? '',
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    updatedBy: ((r.updated_by as string | null) ?? 'user') as Actor,
    note: (r.note as string | null) ?? null,
    deletedAt: r.deleted_at == null ? null : Number(r.deleted_at)
  }
}

function toVersion(r: Row): VersionInfo {
  return {
    n: Number(r.n),
    size: Number(r.size),
    sha256: r.sha256 as string,
    createdAt: Number(r.created_at),
    updatedBy: r.updated_by as Actor,
    note: (r.note as string | null) ?? null,
    baseVersion: r.base_version == null ? null : Number(r.base_version)
  }
}

export class Repo {
  constructor(
    readonly db: DatabaseSync,
    private readonly now: () => number = Date.now
  ) {}

  /** Runs fn inside a transaction (nested calls join the outer one). */
  transaction<T>(fn: () => T): T {
    if (this.inTx) return fn()
    this.inTx = true
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    } finally {
      this.inTx = false
    }
  }
  private inTx = false

  /* ---------- users ---------- */

  upsertUser(input: { googleSub: string | null; email: string; name: string }): UserRow {
    const now = this.now()
    const email = input.email.toLowerCase()
    const existing = (input.googleSub ? this.db.prepare('SELECT * FROM users WHERE google_sub = ?').get(input.googleSub) : undefined) ?? this.db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    if (existing) {
      const row = existing as unknown as UserRow
      this.db.prepare('UPDATE users SET name = ?, email = ?, google_sub = COALESCE(google_sub, ?), last_login_at = ? WHERE id = ?').run(input.name, email, input.googleSub, now, row.id)
      return this.getUser(row.id)!
    }
    const id = crypto.randomUUID()
    this.db.prepare('INSERT INTO users (id, google_sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, input.googleSub, email, input.name, now, now)
    return this.getUser(id)!
  }

  getUser(id: string): UserRow | null {
    return (this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow | undefined) ?? null
  }

  usedBytes(userId: string): number {
    const r = this.db.prepare('SELECT COALESCE(SUM(v.size), 0) AS total FROM versions v JOIN documents d ON d.id = v.doc_id WHERE d.user_id = ?').get(userId) as Row
    return Number(r.total)
  }

  /* ---------- documents ---------- */

  listDocuments(userId: string, includeDeleted = false): CloudDoc[] {
    const sql = `${MANIFEST_SELECT} WHERE d.user_id = ? ${includeDeleted ? '' : 'AND d.deleted_at IS NULL'} ORDER BY d.updated_at DESC`
    return (this.db.prepare(sql).all(userId) as Row[]).map(toManifest)
  }

  getDocument(userId: string, docId: string): CloudDoc | null {
    const r = this.db.prepare(`${MANIFEST_SELECT} WHERE d.user_id = ? AND d.id = ?`).get(userId, docId) as Row | undefined
    return r ? toManifest(r) : null
  }

  createDocument(userId: string, input: { id: string; name: string; path: string }): void {
    const now = this.now()
    this.db.prepare('INSERT INTO documents (id, user_id, name, path, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)').run(input.id, userId, input.name, input.path, now, now)
  }

  renameDocument(userId: string, docId: string, input: { name?: string; path?: string }): boolean {
    const r = this.db
      .prepare('UPDATE documents SET name = COALESCE(?, name), path = COALESCE(?, path), updated_at = ? WHERE user_id = ? AND id = ? AND deleted_at IS NULL')
      .run(input.name ?? null, input.path ?? null, this.now(), userId, docId)
    return r.changes > 0
  }

  setDeleted(userId: string, docId: string, deleted: boolean): boolean {
    const now = this.now()
    const r = this.db.prepare('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?').run(deleted ? now : null, now, userId, docId)
    return r.changes > 0
  }

  /* ---------- versions ---------- */

  insertVersion(userId: string, docId: string, v: { size: number; sha256: string; updatedBy: Actor; note: string | null; baseVersion: number | null }): number {
    const doc = this.db.prepare('SELECT current_version FROM documents WHERE user_id = ? AND id = ?').get(userId, docId) as Row | undefined
    if (!doc) throw new Error('document not found')
    const n = Number(doc.current_version) + 1
    const now = this.now()
    this.db.prepare('INSERT INTO versions (doc_id, n, size, sha256, updated_by, note, base_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(docId, n, v.size, v.sha256, v.updatedBy, v.note, v.baseVersion, now)
    this.db.prepare('UPDATE documents SET current_version = ?, updated_at = ? WHERE id = ?').run(n, now, docId)
    return n
  }

  listVersions(userId: string, docId: string): VersionInfo[] {
    const rows = this.db.prepare('SELECT v.* FROM versions v JOIN documents d ON d.id = v.doc_id WHERE d.user_id = ? AND v.doc_id = ? ORDER BY v.n DESC').all(userId, docId) as Row[]
    return rows.map(toVersion)
  }

  getVersion(userId: string, docId: string, n: number): VersionInfo | null {
    const r = this.db.prepare('SELECT v.* FROM versions v JOIN documents d ON d.id = v.doc_id WHERE d.user_id = ? AND v.doc_id = ? AND v.n = ?').get(userId, docId, n) as Row | undefined
    return r ? toVersion(r) : null
  }

  /** Removes versions older than the newest `keep`; returns the removed version numbers. */
  pruneVersions(docId: string, keep: number): number[] {
    const rows = this.db.prepare('SELECT n FROM versions WHERE doc_id = ? ORDER BY n DESC LIMIT -1 OFFSET ?').all(docId, keep) as Row[]
    const ns = rows.map((r) => Number(r.n))
    for (const n of ns) this.db.prepare('DELETE FROM versions WHERE doc_id = ? AND n = ?').run(docId, n)
    return ns
  }

  /* ---------- change log ---------- */

  appendChange(userId: string, docId: string, kind: ChangeKind, version: number | null): number {
    const r = this.db.prepare('INSERT INTO change_log (user_id, doc_id, kind, version, created_at) VALUES (?, ?, ?, ?, ?)').run(userId, docId, kind, version, this.now())
    return Number(r.lastInsertRowid)
  }

  /** Raw change rows after `since`, oldest first. */
  changesSince(userId: string, since: number): { seq: number; docId: string; kind: ChangeKind }[] {
    const rows = this.db.prepare('SELECT seq, doc_id, kind FROM change_log WHERE user_id = ? AND seq > ? ORDER BY seq ASC').all(userId, since) as Row[]
    return rows.map((r) => ({ seq: Number(r.seq), docId: r.doc_id as string, kind: r.kind as ChangeKind }))
  }

  latestSeq(userId: string): number {
    const r = this.db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM change_log WHERE user_id = ?').get(userId) as Row
    return Number(r.seq)
  }

  /* ---------- oauth clients ---------- */

  getClient(clientId: string): OAuthClientRow | null {
    const r = this.db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId) as Row | undefined
    if (!r) return null
    return {
      client_id: r.client_id as string,
      client_secret_hash: (r.client_secret_hash as string | null) ?? null,
      client_name: r.client_name as string,
      redirect_uris: JSON.parse(r.redirect_uris as string) as string[],
      token_endpoint_auth_method: r.token_endpoint_auth_method as string,
      builtin: Number(r.builtin) === 1,
      created_at: Number(r.created_at)
    }
  }

  putClient(c: Omit<OAuthClientRow, 'created_at'>): void {
    this.db
      .prepare('INSERT OR REPLACE INTO oauth_clients (client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method, builtin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(c.client_id, c.client_secret_hash, c.client_name, JSON.stringify(c.redirect_uris), c.token_endpoint_auth_method, c.builtin ? 1 : 0, this.now())
  }

  countRegisterAttempts(ip: string, since: number): number {
    this.db.prepare('DELETE FROM register_attempts WHERE at < ?').run(since)
    const r = this.db.prepare('SELECT COUNT(*) AS c FROM register_attempts WHERE ip = ? AND at >= ?').get(ip, since) as Row
    return Number(r.c)
  }

  recordRegisterAttempt(ip: string): void {
    this.db.prepare('INSERT INTO register_attempts (ip, at) VALUES (?, ?)').run(ip, this.now())
  }

  /* ---------- login states (pending /authorize) ---------- */

  putLoginState(s: LoginState): void {
    this.db.prepare('INSERT INTO login_states (state, nonce, authorize_params, user_id, expires_at) VALUES (?, ?, ?, ?, ?)').run(s.state, s.nonce, JSON.stringify(s.params), s.userId, s.expiresAt)
  }

  takeLoginState(state: string): LoginState | null {
    this.db.prepare('DELETE FROM login_states WHERE expires_at < ?').run(this.now())
    const r = this.db.prepare('SELECT * FROM login_states WHERE state = ?').get(state) as Row | undefined
    if (!r) return null
    return { state: r.state as string, nonce: r.nonce as string, params: JSON.parse(r.authorize_params as string) as Record<string, string>, userId: (r.user_id as string | null) ?? null, expiresAt: Number(r.expires_at) }
  }

  updateLoginStateUser(state: string, userId: string): void {
    this.db.prepare('UPDATE login_states SET user_id = ? WHERE state = ?').run(userId, state)
  }

  deleteLoginState(state: string): void {
    this.db.prepare('DELETE FROM login_states WHERE state = ?').run(state)
  }

  /* ---------- auth codes ---------- */

  putAuthCode(c: Omit<AuthCodeRow, 'used_at'>): void {
    this.db
      .prepare('INSERT INTO auth_codes (code_hash, client_id, user_id, redirect_uri, scope, code_challenge, resource, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(c.code_hash, c.client_id, c.user_id, c.redirect_uri, c.scope, c.code_challenge, c.resource, c.expires_at)
  }

  getAuthCode(codeHash: string): AuthCodeRow | null {
    return (this.db.prepare('SELECT * FROM auth_codes WHERE code_hash = ?').get(codeHash) as unknown as AuthCodeRow | undefined) ?? null
  }

  markAuthCodeUsed(codeHash: string): void {
    this.db.prepare('UPDATE auth_codes SET used_at = ? WHERE code_hash = ?').run(this.now(), codeHash)
    this.db.prepare('DELETE FROM auth_codes WHERE expires_at < ?').run(this.now() - 3_600_000)
  }

  /* ---------- grants & refresh tokens ---------- */

  createGrant(g: { userId: string; clientId: string; clientName: string; scope: string }): GrantRow {
    const id = crypto.randomUUID()
    this.db.prepare('INSERT INTO grants (id, user_id, client_id, client_name, scope, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, g.userId, g.clientId, g.clientName, g.scope, this.now())
    return this.getGrant(id)!
  }

  getGrant(id: string): GrantRow | null {
    return (this.db.prepare('SELECT * FROM grants WHERE id = ?').get(id) as unknown as GrantRow | undefined) ?? null
  }

  touchGrant(id: string): void {
    this.db.prepare('UPDATE grants SET last_used_at = ? WHERE id = ?').run(this.now(), id)
  }

  revokeGrant(id: string): void {
    this.db.prepare('UPDATE grants SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(this.now(), id)
  }

  /** Revokes a grant only if it belongs to the user; returns whether anything changed. */
  revokeUserGrant(userId: string, grantId: string): boolean {
    const r = this.db.prepare('UPDATE grants SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').run(this.now(), grantId, userId)
    return r.changes > 0
  }

  listConnectedApps(userId: string): ConnectedApp[] {
    const rows = this.db.prepare('SELECT * FROM grants WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC').all(userId) as Row[]
    return rows.map((r) => ({ id: r.id as string, clientId: r.client_id as string, clientName: r.client_name as string, scope: r.scope as string, createdAt: Number(r.created_at), lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at) }))
  }

  putRefreshToken(t: { tokenHash: string; grantId: string; expiresAt: number }): void {
    this.db.prepare('INSERT INTO refresh_tokens (token_hash, grant_id, expires_at) VALUES (?, ?, ?)').run(t.tokenHash, t.grantId, t.expiresAt)
  }

  getRefreshToken(tokenHash: string): RefreshTokenRow | null {
    return (this.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash) as unknown as RefreshTokenRow | undefined) ?? null
  }

  rotateRefreshToken(oldHash: string, newHash: string): void {
    this.db.prepare('UPDATE refresh_tokens SET used_at = ?, replaced_by = ? WHERE token_hash = ?').run(this.now(), newHash, oldHash)
  }
}
