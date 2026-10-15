import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { CloudAccount, CloudDoc, CloudRow, CloudState, ConnectedApp, LocalSyncStatus, NewerOnCloud, VersionInfo } from '../../shared/cloud'
import { log } from '../log'
import { normaliseServerUrl, signInWithBrowser } from './auth'
import { CloudClient, CloudRequestError, SignedOutError } from './client'
import { CloudStore } from './store'
import type { IndexEntry } from './store'

export interface SyncHost {
  openExternal(url: string): Promise<void>
  trash(path: string): Promise<void>
  onState(state: CloudState): void
  onRows(rows: CloudRow[]): void
}

const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 30_000
const POLL_MS = 60_000
const REFRESH_DEBOUNCE_MS = 300

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * The sync engine. Lives in the main process; the renderer only sees CloudState and
 * CloudRow[] pushed through the host callbacks and acts through the IPC handlers.
 *
 * Rules it enforces: the local file is always written before anything is uploaded;
 * nothing is downloaded unless asked; every upload is a new version; and when the
 * cloud is ahead the engine only *reports* it (the renderer asks the user).
 */
export class CloudSync {
  private client: CloudClient | null = null
  private manifests = new Map<string, CloudDoc>()
  private rows: CloudRow[] = []
  private online = false
  private lastSyncAt: number | null = null
  private connectedApps: ConnectedApp[] = []
  private streamAbort: AbortController | null = null
  private retryDelay = RETRY_MIN_MS
  private refreshTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private refreshing: Promise<void> | null = null
  private uploading = new Set<string>()
  private stopped = false

  constructor(
    readonly store: CloudStore,
    private readonly host: SyncHost
  ) {}

  /* ---------- lifecycle ---------- */

  async start(): Promise<void> {
    await this.store.load()
    if (this.store.enabled && this.store.serverUrl && this.store.tokens()) {
      this.connect()
      void this.refresh().then(() => this.flushPending())
    }
    this.emitState()
  }

  stop(): void {
    this.stopped = true
    this.streamAbort?.abort()
    if (this.pollTimer) clearInterval(this.pollTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
  }

  private connect(): void {
    const tokens = this.store.tokens()
    const serverUrl = this.store.serverUrl
    if (!tokens || !serverUrl) return
    this.client = new CloudClient(serverUrl, tokens, (t) => this.store.setTokens(t))
    void this.openStream()
    if (!this.pollTimer) this.pollTimer = setInterval(() => void this.refresh().then(() => this.flushPending()), POLL_MS)
  }

  private async handleSignedOut(): Promise<void> {
    log('cloud: refresh token rejected; signed out')
    this.client = null
    this.streamAbort?.abort()
    await this.store.setTokens(null)
    await this.store.update({ account: null })
    this.setOnline(false)
  }

  /* ---------- state exposed to the renderer ---------- */

  state(): CloudState {
    const account = this.store.account
    const serverUrl = this.store.serverUrl
    const cloudAccount: CloudAccount | null =
      account && serverUrl && this.store.folder ? { ...account, serverUrl, folder: this.store.folder, connectedApps: this.connectedApps } : null
    return {
      enabled: this.store.enabled,
      account: cloudAccount,
      online: this.online,
      lastSyncAt: this.lastSyncAt,
      pendingUploads: Object.values(this.store.docs).filter((e) => e.pending).length,
      connectorUrl: serverUrl ? `${serverUrl}/mcp` : null
    }
  }

  list(): CloudRow[] {
    return this.rows
  }

  private emitState(): void {
    this.host.onState(this.state())
  }

  private setOnline(online: boolean): void {
    if (this.online !== online) {
      this.online = online
      this.emitState()
    }
  }

  /* ---------- sign-in / settings ---------- */

  async signIn(serverInput: string): Promise<CloudAccount> {
    const serverUrl = normaliseServerUrl(serverInput)
    const tokens = await signInWithBrowser(serverUrl, (u) => this.host.openExternal(u))
    await this.store.update({ serverUrl, enabled: true, folder: this.store.folder ?? this.defaultFolder() })
    await this.store.setTokens(tokens)
    this.connect()
    await this.refreshAccount()
    await this.refresh()
    this.emitState()
    return this.state().account!
  }

  private defaultFolder(): string {
    return join(process.env.HOME ?? '', 'Documents', 'Quill')
  }

  async setFolder(folder: string): Promise<void> {
    await fs.mkdir(folder, { recursive: true })
    await this.store.update({ folder })
    this.emitState()
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.store.update({ enabled })
    if (enabled && !this.client) {
      this.connect()
      await this.refresh()
    }
    if (!enabled) {
      this.streamAbort?.abort()
      this.setOnline(false)
    }
    this.emitState()
  }

  async signOut(): Promise<void> {
    if (this.client) await this.client.revoke()
    this.streamAbort?.abort()
    this.client = null
    this.manifests.clear()
    this.rows = []
    this.connectedApps = []
    await this.store.reset()
    this.setOnline(false)
    this.host.onRows([])
    this.emitState()
  }

  async refreshAccount(): Promise<void> {
    if (!this.client) return
    try {
      const [me, apps] = await Promise.all([this.client.me(), this.client.connectedApps()])
      this.connectedApps = apps
      await this.store.update({ account: me })
      this.emitState()
    } catch (err) {
      if (err instanceof SignedOutError) await this.handleSignedOut()
      else log('cloud: account refresh failed', err)
    }
  }

  async disconnectApp(id: string): Promise<void> {
    if (!this.client) throw new Error('Not signed in')
    await this.client.disconnectApp(id)
    await this.refreshAccount()
  }

  /* ---------- manifests & rows ---------- */

  /** Pulls everything that changed since the cursor and recomputes the rows. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    if (!this.client || !this.store.enabled) return
    try {
      if (this.store.cursor === 0 || this.manifests.size === 0) {
        for (const d of await this.client.listDocuments()) this.manifests.set(d.id, d)
      }
      const changes = await this.client.changes(this.store.cursor)
      for (const ch of changes.changes) {
        if (ch.manifest.deletedAt) {
          this.manifests.delete(ch.manifest.id)
          if (this.store.entry(ch.manifest.id)) await this.store.removeEntry(ch.manifest.id)
        } else {
          this.manifests.set(ch.manifest.id, ch.manifest)
        }
      }
      await this.store.update({ cursor: changes.cursor })
      this.lastSyncAt = Date.now()
      this.setOnline(true)
      await this.recomputeRows()
      this.emitState()
    } catch (err) {
      if (err instanceof SignedOutError) await this.handleSignedOut()
      else {
        if (!(err instanceof CloudRequestError)) this.setOnline(false)
        log('cloud: refresh failed', err)
      }
    }
  }

  private async recomputeRows(): Promise<void> {
    const rows: CloudRow[] = []
    for (const m of this.manifests.values()) {
      const entry = this.store.entry(m.id)
      let status: LocalSyncStatus = 'cloud-only'
      let localPath: string | null = null
      let localVersion: number | null = null
      if (entry) {
        if (await exists(entry.localPath)) {
          localPath = entry.localPath
          localVersion = entry.localVersion
          status = entry.pending ? 'pending-upload' : entry.localVersion < m.currentVersion ? 'newer-on-cloud' : 'synced'
        } else {
          await this.store.removeEntry(m.id)
        }
      }
      rows.push({ ...m, localPath, localVersion, status })
    }
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    this.rows = rows
    this.host.onRows(rows)
  }

  /** Whether a local file is a synced document, and if the cloud is ahead of it. */
  trackingFor(localPath: string): { docId: string; newer: NewerOnCloud | null } | null {
    const entry = this.store.entryByPath(localPath)
    if (!entry) return null
    const m = this.manifests.get(entry.docId)
    if (!m || m.currentVersion <= entry.localVersion || entry.pending) return { docId: entry.docId, newer: null }
    const newer: VersionInfo = { n: m.currentVersion, size: m.size, sha256: m.sha256, createdAt: m.updatedAt, updatedBy: m.updatedBy, note: m.note, baseVersion: null }
    return { docId: entry.docId, newer: { docId: entry.docId, localVersion: entry.localVersion, newer } }
  }

  /* ---------- change stream ---------- */

  private async openStream(): Promise<void> {
    if (!this.client || this.stopped || !this.store.enabled) return
    this.streamAbort?.abort()
    const abort = new AbortController()
    this.streamAbort = abort
    try {
      const res = await this.client.openStream(this.store.cursor, abort.signal)
      if (!res.body) throw new Error('no stream body')
      this.retryDelay = RETRY_MIN_MS
      this.setOnline(true)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          if (/^event: change/m.test(frame)) this.scheduleRefresh()
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return
      if (err instanceof SignedOutError) {
        await this.handleSignedOut()
        return
      }
    }
    if (abort.signal.aborted || this.stopped) return
    this.setOnline(false)
    const delay = this.retryDelay
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2)
    setTimeout(() => void this.openStream(), delay)
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS)
  }

  /* ---------- uploads ---------- */

  /** Called after every successful local save. Uploads when the file is a synced document. */
  async onLocalSave(localPath: string, bytes: Uint8Array): Promise<void> {
    const entry = this.store.entryByPath(localPath)
    if (!entry || !this.client || !this.store.enabled) return
    await this.store.putEntry({ ...entry, pending: true })
    await this.recomputeRows()
    this.emitState()
    await this.uploadEntry(entry.docId, bytes)
  }

  private async uploadEntry(docId: string, bytes?: Uint8Array): Promise<void> {
    const entry = this.store.entry(docId)
    if (!entry || !this.client || this.uploading.has(docId)) return
    this.uploading.add(docId)
    try {
      const data = bytes ?? (await fs.readFile(entry.localPath))
      const manifest = await this.client.addVersion(docId, { bytes: data, baseVersion: entry.localVersion })
      this.manifests.set(manifest.id, manifest)
      await this.store.putEntry({ ...entry, localVersion: manifest.currentVersion, pending: false })
      this.lastSyncAt = Date.now()
      this.setOnline(true)
    } catch (err) {
      if (err instanceof SignedOutError) await this.handleSignedOut()
      else if (err instanceof CloudRequestError && err.status === 404) {
        // The document was removed from the cloud on another device; stop tracking it.
        await this.store.removeEntry(docId)
      } else {
        if (!(err instanceof CloudRequestError)) this.setOnline(false)
        log('cloud: upload failed, will retry', err)
      }
    } finally {
      this.uploading.delete(docId)
      await this.recomputeRows()
      this.emitState()
    }
  }

  /** Retries every upload that did not reach the cloud. */
  async flushPending(): Promise<void> {
    if (!this.client || !this.store.enabled) return
    for (const entry of Object.values(this.store.docs)) if (entry.pending) await this.uploadEntry(entry.docId)
  }

  /** Starts syncing a file that lives on this Mac. */
  async uploadLocal(localPath: string): Promise<CloudRow> {
    if (!this.client) throw new Error('Sign in to Cloud first')
    const existing = this.store.entryByPath(localPath)
    if (existing) return this.rows.find((r) => r.id === existing.docId) ?? this.rowFor(existing.docId)
    const bytes = await fs.readFile(localPath)
    const folder = this.store.folder
    const rel = folder && localPath.startsWith(folder + sep) ? dirname(relative(folder, localPath)).split(sep).filter((p) => p && p !== '.').join('/') : ''
    const manifest = await this.client.createDocument({ name: basename(localPath, '.docx'), path: rel, bytes })
    this.manifests.set(manifest.id, manifest)
    await this.store.putEntry({ docId: manifest.id, localPath, localVersion: manifest.currentVersion, pending: false })
    await this.recomputeRows()
    this.emitState()
    return this.rowFor(manifest.id)
  }

  private rowFor(docId: string): CloudRow {
    const row = this.rows.find((r) => r.id === docId)
    if (!row) throw new Error('Document not found')
    return row
  }

  /* ---------- downloads ---------- */

  /** Downloads a version (default: newest) into the Quill folder and tracks it. Returns the local path. */
  async download(docId: string, n?: number): Promise<string> {
    if (!this.client) throw new Error('Sign in to Cloud first')
    const folder = this.store.folder
    if (!folder) throw new Error('Choose a Quill folder first')
    const manifest = this.manifests.get(docId) ?? (await this.client.getDocument(docId))
    this.manifests.set(manifest.id, manifest)
    const version = n ?? manifest.currentVersion
    const bytes = await this.client.content(docId, version)
    const existing = this.store.entry(docId)
    const target = existing?.localPath ?? (await this.freePath(join(folder, ...manifest.path.split('/').filter(Boolean)), manifest.name, docId))
    await fs.mkdir(dirname(target), { recursive: true })
    await fs.writeFile(target, bytes)
    await this.store.putEntry({ docId, localPath: target, localVersion: version, pending: false })
    await this.recomputeRows()
    this.emitState()
    return target
  }

  /** `<dir>/<name>.docx`, or `<name> (2).docx` when a different file already uses the name. */
  private async freePath(dir: string, name: string, docId: string): Promise<string> {
    for (let i = 1; i < 1000; i++) {
      const candidate = join(dir, i === 1 ? `${name}.docx` : `${name} (${i}).docx`)
      if (!(await exists(candidate))) return candidate
      const owner = this.store.entryByPath(candidate)
      if (owner?.docId === docId) return candidate
    }
    throw new Error('Could not find a free file name')
  }

  async removeDownload(docId: string): Promise<void> {
    const entry = this.store.entry(docId)
    if (!entry) return
    if (await exists(entry.localPath)) await this.host.trash(entry.localPath)
    await this.store.removeEntry(docId)
    await this.recomputeRows()
    this.emitState()
  }

  /** Removes the document from the cloud (soft delete there); the local file stays and becomes a plain file. */
  async stopSyncing(docId: string): Promise<void> {
    if (!this.client) throw new Error('Sign in to Cloud first')
    await this.client.softDelete(docId)
    this.manifests.delete(docId)
    await this.store.removeEntry(docId)
    await this.recomputeRows()
    this.emitState()
  }

  async versions(docId: string): Promise<VersionInfo[]> {
    if (!this.client) throw new Error('Sign in to Cloud first')
    return this.client.versions(docId)
  }

  /** Makes an older version the newest on the cloud, then downloads it. */
  async restore(docId: string, n: number): Promise<string> {
    if (!this.client) throw new Error('Sign in to Cloud first')
    const manifest = await this.client.restoreVersion(docId, n)
    this.manifests.set(manifest.id, manifest)
    return this.download(docId, manifest.currentVersion)
  }

  /** After a rename on disk through Save As, keep the index pointing at the file. */
  async noteLocalPath(oldPath: string, newPath: string): Promise<void> {
    const entry = this.store.entryByPath(oldPath)
    if (entry && oldPath !== newPath) {
      await this.store.putEntry({ ...entry, localPath: newPath })
      if (this.client) {
        try {
          const m = await this.client.rename(entry.docId, { name: basename(newPath, '.docx') })
          this.manifests.set(m.id, m)
        } catch (err) {
          log('cloud: rename failed', err)
        }
      }
      await this.recomputeRows()
    }
  }

  /** Index entries whose files live on this Mac, for the start screen's "On this Mac" filter. */
  trackedPaths(): Set<string> {
    return new Set(Object.values(this.store.docs).map((e) => e.localPath))
  }

  entryFor(docId: string): IndexEntry | null {
    return this.store.entry(docId)
  }
}
