import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { createApp } from '../src/app'
import type { Identity, IdentityProvider } from '../src/auth/identity'
import { TokenSigner } from '../src/auth/jwt'
import { BlobStore } from '../src/blobs'
import type { Config } from '../src/config'
import { Repo } from '../src/db/repo'
import { openDatabase } from '../src/db/schema'
import { ChangeBus } from '../src/events'
import { DocumentService } from '../src/service/documents'
import type { AppDeps, Env } from '../src/types'
import { DESKTOP_CLIENT_ID, HEADER_BASE_VERSION, HEADER_NAME, HEADER_NOTE, HEADER_PATH } from '../../src/shared/cloud'
import { buildDocx } from '../../src/main/docx/build'
import { DEFAULT_PAGE_SETUP } from '../../src/shared/pageSetup'
import type { JSONContent } from '../../src/shared/types'

export const ISSUER = 'http://127.0.0.1:8787'

/** Identity provider whose "code" is the JSON of the identity to return. */
export class FakeIdentity implements IdentityProvider {
  readonly kind = 'dev' as const
  authorizeUrl({ state }: { state: string; nonce: string; redirectUri: string }): string {
    return `https://idp.test/authorize?state=${state}`
  }
  async exchange({ code }: { code: string; nonce: string; redirectUri: string }): Promise<Identity> {
    const id = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Identity
    if (!id.email) throw new Error('bad code')
    return id
  }
  static code(id: Identity): string {
    return Buffer.from(JSON.stringify(id)).toString('base64url')
  }
}

export interface TestServer {
  app: Hono<Env>
  deps: AppDeps
  clock: { now: number; advance(ms: number): void }
  cleanup(): Promise<void>
}

export async function testServer(overrides: Partial<Config> = {}): Promise<TestServer> {
  const dataDir = await fs.mkdtemp(join(tmpdir(), 'quill-cloud-test-'))
  const config: Config = {
    issuer: ISSUER,
    host: '127.0.0.1',
    port: 8787,
    dataDir,
    google: null,
    devLogin: true,
    allowedEmails: [],
    quotaBytes: 50 * 1024 * 1024,
    keepVersions: 30,
    maxUploadBytes: 5 * 1024 * 1024,
    ...overrides
  }
  const clock = {
    now: Date.UTC(2026, 9, 14, 12, 0, 0),
    advance(ms: number) {
      this.now += ms
    }
  }
  const now = (): number => clock.now
  const db = openDatabase(':memory:')
  const repo = new Repo(db, now)
  const blobs = new BlobStore(dataDir)
  const bus = new ChangeBus()
  const signer = await TokenSigner.load(null, ISSUER)
  const docs = new DocumentService(repo, blobs, bus, { keepVersions: config.keepVersions, quotaBytes: config.quotaBytes })
  const deps: AppDeps = { config, repo, blobs, bus, signer, identity: new FakeIdentity(), docs, now, log: () => {} }
  const app = createApp(deps)
  return { app, deps, clock, cleanup: () => fs.rm(dataDir, { recursive: true, force: true }) }
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

export interface Session {
  access: string
  refresh: string
  userId: string
  clientId: string
}

export function form(data: Record<string, string>): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() }
}

/**
 * Walks the full authorisation-code flow as a client would: /oauth/authorize → identity
 * provider → /auth/callback (→ consent for non-builtin clients) → /oauth/token.
 */
export async function signIn(
  t: TestServer,
  who: Identity,
  opts: { clientId?: string; clientSecret?: string; redirectUri?: string; scope?: string; consent?: 'allow' | 'deny' } = {}
): Promise<Session> {
  const clientId = opts.clientId ?? DESKTOP_CLIENT_ID
  const redirectUri = opts.redirectUri ?? 'http://127.0.0.1:50000/callback'
  const { verifier, challenge } = pkce()
  const authorize = new URL(`${ISSUER}/oauth/authorize`)
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  authorize.searchParams.set('state', 'client-state-1')
  if (opts.scope) authorize.searchParams.set('scope', opts.scope)
  const r1 = await t.app.request(authorize.toString())
  if (r1.status !== 302) throw new Error(`authorize returned ${r1.status}: ${await r1.text()}`)
  const idpUrl = new URL(r1.headers.get('location')!)
  const state = idpUrl.searchParams.get('state')!

  const r2 = await t.app.request(`${ISSUER}/auth/callback?state=${state}&code=${FakeIdentity.code(who)}`)
  let location: string
  if (r2.status === 302) {
    location = r2.headers.get('location')!
  } else if (r2.status === 200) {
    const html = await r2.text()
    const stateField = /name="state" value="([^"]+)"/.exec(html)
    if (!stateField) throw new Error('consent page without state')
    const r3 = await t.app.request(`${ISSUER}/oauth/authorize/decision`, form({ state: stateField[1], decision: opts.consent ?? 'allow' }))
    if (r3.status !== 302) throw new Error(`decision returned ${r3.status}`)
    location = r3.headers.get('location')!
  } else {
    throw new Error(`callback returned ${r2.status}: ${await r2.text()}`)
  }
  const redirected = new URL(location)
  const code = redirected.searchParams.get('code')
  if (!code) throw new Error(`no code: ${location}`)
  if (redirected.searchParams.get('state') !== 'client-state-1') throw new Error('state not echoed')

  const r4 = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId, ...(opts.clientSecret ? { client_secret: opts.clientSecret } : {}) }))
  if (r4.status !== 200) throw new Error(`token returned ${r4.status}: ${await r4.text()}`)
  const tokens = (await r4.json()) as { access_token: string; refresh_token: string }
  const me = await t.app.request(`${ISSUER}/api/v1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` } })
  const { id } = (await me.json()) as { id: string }
  return { access: tokens.access_token, refresh: tokens.refresh_token, userId: id, clientId }
}

export const auth = (s: Session): Record<string, string> => ({ authorization: `Bearer ${s.access}` })

export function doc(...paragraphs: string[]): JSONContent {
  return { type: 'doc', content: paragraphs.map((p) => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })) }
}

export async function docxBytes(json: JSONContent = doc('Hello from the test')): Promise<Buffer> {
  return buildDocx(json, DEFAULT_PAGE_SETUP)
}

export async function upload(t: TestServer, s: Session, input: { name: string; path?: string; note?: string; json?: JSONContent }): Promise<Response> {
  const bytes = await docxBytes(input.json)
  return t.app.request(`${ISSUER}/api/v1/documents`, {
    method: 'POST',
    headers: { ...auth(s), [HEADER_NAME]: encodeURIComponent(input.name), [HEADER_PATH]: encodeURIComponent(input.path ?? ''), ...(input.note ? { [HEADER_NOTE]: encodeURIComponent(input.note) } : {}) },
    body: new Uint8Array(bytes)
  })
}

export async function uploadVersion(t: TestServer, s: Session, docId: string, input: { json?: JSONContent; base?: number; note?: string } = {}): Promise<Response> {
  const bytes = await docxBytes(input.json)
  return t.app.request(`${ISSUER}/api/v1/documents/${docId}/versions`, {
    method: 'POST',
    headers: { ...auth(s), ...(input.base ? { [HEADER_BASE_VERSION]: String(input.base) } : {}), ...(input.note ? { [HEADER_NOTE]: encodeURIComponent(input.note) } : {}) },
    body: new Uint8Array(bytes)
  })
}
