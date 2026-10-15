import type { AccountInfo, Changes, CloudDoc, ConnectedApp, VersionInfo } from '../../shared/cloud'
import { DESKTOP_CLIENT_ID, DOCX_MIME, HEADER_BASE_VERSION, HEADER_NAME, HEADER_NOTE, HEADER_PATH } from '../../shared/cloud'
import type { Tokens } from './store'

export class CloudRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

/** Thrown when the refresh token is rejected: the user has to sign in again. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out of Quill Cloud')
  }
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

export function tokensFromResponse(r: TokenResponse, now = Date.now()): Tokens {
  return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: now + (r.expires_in - 30) * 1000 }
}

/**
 * Typed wrapper around the server's desktop API. Refreshes the access token when
 * it is about to expire or when the server answers 401, once per request.
 */
export class CloudClient {
  constructor(
    readonly serverUrl: string,
    private tokens: Tokens,
    private readonly onTokens: (t: Tokens) => Promise<void>,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  private url(path: string): string {
    return `${this.serverUrl}/api/v1${path}`
  }

  async refreshTokens(): Promise<void> {
    const res = await this.fetchFn(`${this.serverUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.tokens.refreshToken, client_id: DESKTOP_CLIENT_ID }).toString()
    })
    if (res.status === 400 || res.status === 401) throw new SignedOutError()
    if (!res.ok) throw new CloudRequestError(res.status, 'refresh_failed', `Token refresh failed (${res.status})`)
    this.tokens = tokensFromResponse((await res.json()) as TokenResponse)
    await this.onTokens(this.tokens)
  }

  private async request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    if (this.tokens.expiresAt <= Date.now()) await this.refreshTokens()
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${this.tokens.accessToken}`)
    const res = await this.fetchFn(this.url(path), { ...init, headers })
    if (res.status === 401 && retry) {
      await this.refreshTokens()
      return this.request(path, init, false)
    }
    if (!res.ok && res.status !== 304) {
      let code = 'request_failed'
      let message = `Request failed (${res.status})`
      try {
        const body = (await res.json()) as { error?: string; error_description?: string }
        code = body.error ?? code
        message = body.error_description ?? message
      } catch {
        /* non-JSON error body */
      }
      throw new CloudRequestError(res.status, code, message)
    }
    return res
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.request(path, init)).json() as Promise<T>
  }

  me(): Promise<AccountInfo> {
    return this.json('/me')
  }
  connectedApps(): Promise<ConnectedApp[]> {
    return this.json('/connected-apps')
  }
  async disconnectApp(id: string): Promise<void> {
    await this.request(`/connected-apps/${id}`, { method: 'DELETE' })
  }

  listDocuments(): Promise<CloudDoc[]> {
    return this.json('/documents')
  }
  changes(since: number): Promise<Changes> {
    return this.json(`/changes?since=${since}`)
  }
  getDocument(id: string): Promise<CloudDoc> {
    return this.json(`/documents/${id}`)
  }

  createDocument(input: { name: string; path: string; bytes: Uint8Array; note?: string | null }): Promise<CloudDoc> {
    const headers: Record<string, string> = { 'content-type': DOCX_MIME, [HEADER_NAME]: encodeURIComponent(input.name), [HEADER_PATH]: encodeURIComponent(input.path) }
    if (input.note) headers[HEADER_NOTE] = encodeURIComponent(input.note)
    return this.json('/documents', { method: 'POST', headers, body: input.bytes as unknown as BodyInit })
  }

  addVersion(id: string, input: { bytes: Uint8Array; baseVersion: number | null; note?: string | null }): Promise<CloudDoc> {
    const headers: Record<string, string> = { 'content-type': DOCX_MIME }
    if (input.baseVersion) headers[HEADER_BASE_VERSION] = String(input.baseVersion)
    if (input.note) headers[HEADER_NOTE] = encodeURIComponent(input.note)
    return this.json(`/documents/${id}/versions`, { method: 'POST', headers, body: input.bytes as unknown as BodyInit })
  }

  rename(id: string, patch: { name?: string; path?: string }): Promise<CloudDoc> {
    return this.json(`/documents/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
  }
  async softDelete(id: string): Promise<void> {
    await this.request(`/documents/${id}`, { method: 'DELETE' })
  }
  versions(id: string): Promise<VersionInfo[]> {
    return this.json(`/documents/${id}/versions`)
  }
  async content(id: string, n: number): Promise<Buffer> {
    const res = await this.request(`/documents/${id}/versions/${n}/content`)
    return Buffer.from(await res.arrayBuffer())
  }
  restoreVersion(id: string, n: number, note?: string): Promise<CloudDoc> {
    return this.json(`/documents/${id}/versions/${n}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: note ?? null }) })
  }

  /** Opens the change stream; the caller reads the body. Includes the bearer token and a Last-Event-ID. */
  async openStream(since: number, signal: AbortSignal): Promise<Response> {
    return this.request(`/changes/stream?since=${since}`, { headers: { accept: 'text/event-stream' }, signal })
  }

  async revoke(): Promise<void> {
    await this.fetchFn(`${this.serverUrl}/oauth/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: this.tokens.refreshToken, client_id: DESKTOP_CLIENT_ID }).toString()
    }).catch(() => undefined)
  }
}
