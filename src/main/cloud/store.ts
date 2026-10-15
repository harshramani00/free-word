import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AccountInfo } from '../../shared/cloud'
import { log } from '../log'

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms when the access token stops working. */
  expiresAt: number
}

/** What this Mac knows about one synced document. */
export interface IndexEntry {
  docId: string
  /** Absolute path of the local copy. */
  localPath: string
  /** The cloud version the local copy was downloaded from or uploaded as. */
  localVersion: number
  /** True while a local save has not reached the cloud yet. */
  pending: boolean
}

interface StoreData {
  version: 1
  enabled: boolean
  serverUrl: string | null
  folder: string | null
  /** Tokens encrypted with safeStorage, base64; `tokensPlain` only when the keychain is unavailable. */
  tokens: string | null
  tokensPlain: Tokens | null
  account: AccountInfo | null
  cursor: number
  docs: Record<string, IndexEntry>
}

const EMPTY: StoreData = { version: 1, enabled: false, serverUrl: null, folder: null, tokens: null, tokensPlain: null, account: null, cursor: 0, docs: {} }

/**
 * Everything Cloud persists on this Mac: settings, the account, encrypted tokens and
 * the local index of synced documents. One JSON file in userData, written atomically.
 */
export class CloudStore {
  private data: StoreData = { ...EMPTY, docs: {} }
  private file: string
  private saving: Promise<void> = Promise.resolve()

  constructor(file = join(app.getPath('userData'), 'cloud.json')) {
    this.file = file
  }

  async load(): Promise<void> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<StoreData>
      this.data = { ...EMPTY, ...raw, docs: raw.docs ?? {} }
    } catch {
      this.data = { ...EMPTY, docs: {} }
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2)
    this.saving = this.saving.then(async () => {
      await fs.mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await fs.writeFile(tmp, snapshot, 'utf8')
      await fs.rename(tmp, this.file)
    })
    return this.saving.catch((err) => log('cloud store save failed', err))
  }

  get enabled(): boolean {
    return this.data.enabled
  }
  get serverUrl(): string | null {
    return this.data.serverUrl
  }
  get folder(): string | null {
    return this.data.folder
  }
  get account(): AccountInfo | null {
    return this.data.account
  }
  get cursor(): number {
    return this.data.cursor
  }
  get docs(): Record<string, IndexEntry> {
    return this.data.docs
  }

  async update(patch: Partial<Pick<StoreData, 'enabled' | 'serverUrl' | 'folder' | 'account' | 'cursor'>>): Promise<void> {
    Object.assign(this.data, patch)
    await this.persist()
  }

  tokens(): Tokens | null {
    if (this.data.tokens) {
      try {
        if (!safeStorage.isEncryptionAvailable()) return null
        return JSON.parse(safeStorage.decryptString(Buffer.from(this.data.tokens, 'base64'))) as Tokens
      } catch (err) {
        log('cloud tokens could not be decrypted', err)
        return null
      }
    }
    return this.data.tokensPlain
  }

  async setTokens(tokens: Tokens | null): Promise<void> {
    if (!tokens) {
      this.data.tokens = null
      this.data.tokensPlain = null
    } else if (safeStorage.isEncryptionAvailable()) {
      this.data.tokens = safeStorage.encryptString(JSON.stringify(tokens)).toString('base64')
      this.data.tokensPlain = null
    } else {
      log('safeStorage unavailable; cloud tokens stored unencrypted')
      this.data.tokens = null
      this.data.tokensPlain = tokens
    }
    await this.persist()
  }

  entry(docId: string): IndexEntry | null {
    return this.data.docs[docId] ?? null
  }

  entryByPath(localPath: string): IndexEntry | null {
    return Object.values(this.data.docs).find((e) => e.localPath === localPath) ?? null
  }

  async putEntry(entry: IndexEntry): Promise<void> {
    this.data.docs[entry.docId] = entry
    await this.persist()
  }

  async removeEntry(docId: string): Promise<void> {
    delete this.data.docs[docId]
    await this.persist()
  }

  /** Forgets the account and index but keeps the server address and folder for a quick re-sign-in. */
  async reset(): Promise<void> {
    this.data = { ...EMPTY, docs: {}, serverUrl: this.data.serverUrl, folder: this.data.folder }
    await this.persist()
  }
}
