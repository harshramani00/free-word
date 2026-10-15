import type { Actor, Change, Changes, CloudDoc, VersionInfo } from '../../../src/shared/cloud'
import type { BlobStore } from '../blobs'
import type { Repo } from '../db/repo'
import type { ChangeBus } from '../events'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string
  ) {
    super(message ?? code)
  }
}

export const notFound = (): HttpError => new HttpError(404, 'not_found', 'No such document')

/** Normalises a folder path: forward slashes, no leading/trailing slash, no '..' segments. */
export function cleanPath(input: string | null | undefined): string {
  const parts = (input ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && s !== '.' && s !== '..')
  return parts.join('/')
}

export function cleanName(input: string | null | undefined): string {
  const name = (input ?? '')
    .replace(/\.docx$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name) throw new HttpError(400, 'invalid_name', 'A document needs a name')
  return name.slice(0, 200)
}

export interface DocumentServiceOptions {
  keepVersions: number
  quotaBytes: number
}

/**
 * Documents and versions for one server. Every method takes the acting user's id
 * first; the repo scopes every query by it. Mutations run in one transaction,
 * after the blob is safely on disk, and append to the change log.
 */
export class DocumentService {
  constructor(
    private readonly repo: Repo,
    private readonly blobs: BlobStore,
    private readonly bus: ChangeBus,
    private readonly opts: DocumentServiceOptions
  ) {}

  list(userId: string, includeDeleted = false): CloudDoc[] {
    return this.repo.listDocuments(userId, includeDeleted)
  }

  get(userId: string, docId: string): CloudDoc {
    const doc = this.repo.getDocument(userId, docId)
    if (!doc) throw notFound()
    return doc
  }

  changes(userId: string, since: number): Changes {
    const raw = this.repo.changesSince(userId, since)
    const latest = new Map<string, { seq: number; kind: Change['kind'] }>()
    for (const r of raw) latest.set(r.docId, { seq: r.seq, kind: r.kind })
    const changes: Change[] = []
    for (const [docId, { seq, kind }] of latest) {
      const manifest = this.repo.getDocument(userId, docId)
      if (manifest) changes.push({ seq, kind, manifest })
    }
    changes.sort((a, b) => a.seq - b.seq)
    return { cursor: raw.length ? raw[raw.length - 1].seq : Math.max(since, this.repo.latestSeq(userId)), changes }
  }

  async create(userId: string, input: { name: string; path: string; bytes: Uint8Array; updatedBy: Actor; note: string | null }): Promise<CloudDoc> {
    this.checkQuota(userId, input.bytes.byteLength)
    const id = crypto.randomUUID()
    const name = cleanName(input.name)
    const path = cleanPath(input.path)
    const written = await this.blobs.write(userId, id, 1, input.bytes)
    const doc = this.repo.transaction(() => {
      this.repo.createDocument(userId, { id, name, path })
      const n = this.repo.insertVersion(userId, id, { ...written, updatedBy: input.updatedBy, note: input.note, baseVersion: null })
      const seq = this.repo.appendChange(userId, id, 'version', n)
      return { manifest: this.repo.getDocument(userId, id)!, seq, n }
    })
    this.bus.publish(userId, { seq: doc.seq, docId: id, kind: 'version' })
    return doc.manifest
  }

  async addVersion(userId: string, docId: string, input: { bytes: Uint8Array; updatedBy: Actor; note: string | null; baseVersion: number | null }): Promise<CloudDoc> {
    const existing = this.repo.getDocument(userId, docId)
    if (!existing || existing.deletedAt) throw notFound()
    this.checkQuota(userId, input.bytes.byteLength)
    const n = existing.currentVersion + 1
    const written = await this.blobs.write(userId, docId, n, input.bytes)
    const { manifest, seq, pruned } = this.repo.transaction(() => {
      const inserted = this.repo.insertVersion(userId, docId, { ...written, updatedBy: input.updatedBy, note: input.note, baseVersion: input.baseVersion })
      if (inserted !== n) throw new HttpError(409, 'conflict', 'Concurrent upload; retry')
      const pruned = this.repo.pruneVersions(docId, this.opts.keepVersions)
      const seq = this.repo.appendChange(userId, docId, 'version', n)
      return { manifest: this.repo.getDocument(userId, docId)!, seq, pruned }
    })
    for (const old of pruned) void this.blobs.remove(userId, docId, old)
    this.bus.publish(userId, { seq, docId, kind: 'version' })
    return manifest
  }

  rename(userId: string, docId: string, input: { name?: string; path?: string }): CloudDoc {
    const patch = { name: input.name === undefined ? undefined : cleanName(input.name), path: input.path === undefined ? undefined : cleanPath(input.path) }
    const { manifest, seq } = this.repo.transaction(() => {
      if (!this.repo.renameDocument(userId, docId, patch)) throw notFound()
      const seq = this.repo.appendChange(userId, docId, 'rename', null)
      return { manifest: this.repo.getDocument(userId, docId)!, seq }
    })
    this.bus.publish(userId, { seq, docId, kind: 'rename' })
    return manifest
  }

  softDelete(userId: string, docId: string): void {
    const seq = this.repo.transaction(() => {
      const doc = this.repo.getDocument(userId, docId)
      if (!doc) throw notFound()
      if (doc.deletedAt) return null
      this.repo.setDeleted(userId, docId, true)
      return this.repo.appendChange(userId, docId, 'delete', null)
    })
    if (seq !== null) this.bus.publish(userId, { seq, docId, kind: 'delete' })
  }

  undelete(userId: string, docId: string): CloudDoc {
    const { manifest, seq } = this.repo.transaction(() => {
      const doc = this.repo.getDocument(userId, docId)
      if (!doc) throw notFound()
      this.repo.setDeleted(userId, docId, false)
      const seq = this.repo.appendChange(userId, docId, 'restore', null)
      return { manifest: this.repo.getDocument(userId, docId)!, seq }
    })
    this.bus.publish(userId, { seq, docId, kind: 'restore' })
    return manifest
  }

  versions(userId: string, docId: string): VersionInfo[] {
    this.get(userId, docId)
    return this.repo.listVersions(userId, docId)
  }

  version(userId: string, docId: string, n: number): VersionInfo {
    const v = this.repo.getVersion(userId, docId, n)
    if (!v) throw new HttpError(404, 'not_found', 'No such version')
    return v
  }

  async content(userId: string, docId: string, n?: number): Promise<{ version: VersionInfo; bytes: Buffer }> {
    const doc = this.get(userId, docId)
    const version = this.version(userId, docId, n ?? doc.currentVersion)
    const bytes = await this.blobs.read(userId, docId, version.n)
    return { version, bytes }
  }

  /** Copies an older version's bytes as the new newest version. */
  async restoreVersion(userId: string, docId: string, n: number, input: { updatedBy: Actor; note: string | null }): Promise<CloudDoc> {
    const { version, bytes } = await this.content(userId, docId, n)
    return this.addVersion(userId, docId, { bytes, updatedBy: input.updatedBy, note: input.note ?? `Restored version ${version.n}`, baseVersion: version.n })
  }

  private checkQuota(userId: string, incoming: number): void {
    if (this.repo.usedBytes(userId) + incoming > this.opts.quotaBytes) throw new HttpError(413, 'quota_exceeded', 'Your cloud storage is full')
  }
}
