import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { GoogleConfig } from '../config'

/** What we learn about a person from the identity provider. */
export interface Identity {
  /** Stable provider id ('google:<sub>' or null for the local dev login). */
  sub: string | null
  email: string
  name: string
}

/**
 * The step of the login that talks to the outside world. The OAuth server sends
 * the browser to `authorizeUrl` and later receives `code` on our callback.
 */
export interface IdentityProvider {
  readonly kind: 'google' | 'dev'
  authorizeUrl(input: { state: string; nonce: string; redirectUri: string }): string
  exchange(input: { code: string; nonce: string; redirectUri: string }): Promise<Identity>
}

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_JWKS = new URL('https://www.googleapis.com/oauth2/v3/certs')

export class GoogleIdentityProvider implements IdentityProvider {
  readonly kind = 'google' as const
  private readonly jwks = createRemoteJWKSet(GOOGLE_JWKS)
  constructor(
    private readonly cfg: GoogleConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  authorizeUrl({ state, nonce, redirectUri }: { state: string; nonce: string; redirectUri: string }): string {
    const u = new URL(GOOGLE_AUTH)
    u.searchParams.set('client_id', this.cfg.clientId)
    u.searchParams.set('redirect_uri', redirectUri)
    u.searchParams.set('response_type', 'code')
    u.searchParams.set('scope', 'openid email profile')
    u.searchParams.set('state', state)
    u.searchParams.set('nonce', nonce)
    u.searchParams.set('prompt', 'select_account')
    return u.toString()
  }

  async exchange({ code, nonce, redirectUri }: { code: string; nonce: string; redirectUri: string }): Promise<Identity> {
    const res = await this.fetchFn(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
    })
    if (!res.ok) throw new Error(`Google token endpoint returned ${res.status}`)
    const body = (await res.json()) as { id_token?: string }
    if (!body.id_token) throw new Error('Google returned no id_token')
    const { payload } = await jwtVerify(body.id_token, this.jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: this.cfg.clientId })
    if (payload.nonce !== nonce) throw new Error('nonce mismatch')
    if (payload.email_verified !== true || typeof payload.email !== 'string' || typeof payload.sub !== 'string') throw new Error('Google account has no verified email')
    return { sub: `google:${payload.sub}`, email: payload.email, name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email }
  }
}

/**
 * Local stand-in for Google, allowed only on a loopback issuer: the "provider"
 * is a form on this server that asks for a name and email. Never for production.
 */
export class DevIdentityProvider implements IdentityProvider {
  readonly kind = 'dev' as const
  constructor(private readonly issuer: string) {}

  authorizeUrl({ state, nonce }: { state: string; nonce: string; redirectUri: string }): string {
    const u = new URL('/auth/dev', this.issuer)
    u.searchParams.set('state', state)
    u.searchParams.set('nonce', nonce)
    return u.toString()
  }

  async exchange({ code, nonce }: { code: string; nonce: string; redirectUri: string }): Promise<Identity> {
    const parsed = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as { email?: string; name?: string; nonce?: string }
    if (parsed.nonce !== nonce || !parsed.email) throw new Error('invalid dev login code')
    return { sub: null, email: parsed.email.toLowerCase(), name: parsed.name?.trim() || parsed.email }
  }

  /** Builds the code the dev form posts back; the form lives in auth/oauth.ts. */
  static encodeCode(input: { email: string; name: string; nonce: string }): string {
    return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url')
  }
}
