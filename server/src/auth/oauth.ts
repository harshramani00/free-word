import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { OAuthClientMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js'
import { ALL_SCOPES, DESKTOP_CLIENT_ID } from '../../../src/shared/cloud'
import { isLoopbackOrigin } from '../config'
import type { OAuthClientRow } from '../db/repo'
import { DevIdentityProvider } from './identity'
import { ACCESS_TOKEN_TTL_SEC } from './jwt'
import { consentPage, desktopDonePage, devLoginPage, errorPage } from './pages'
import type { AppDeps, Env } from '../types'

const CODE_TTL_MS = 5 * 60_000
const LOGIN_STATE_TTL_MS = 15 * 60_000
const REFRESH_TTL_DESKTOP_MS = 90 * 86_400_000
const REFRESH_TTL_OTHER_MS = 30 * 86_400_000
const REGISTER_LIMIT_PER_HOUR = 10

export const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
const random = (bytes = 32): string => randomBytes(bytes).toString('base64url')

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false
  const digest = createHash('sha256').update(verifier).digest('base64url')
  const a = Buffer.from(digest)
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The desktop app may use any loopback port (RFC 8252 §7.3); registered clients must match exactly. */
export function redirectAllowed(client: OAuthClientRow, uri: string): boolean {
  if (client.redirect_uris.includes(uri)) return true
  if (client.client_id !== DESKTOP_CLIENT_ID) return false
  try {
    const u = new URL(uri)
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]') && u.pathname === '/callback' && !u.search && !u.hash
  } catch {
    return false
  }
}

function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:') return true
    return u.protocol === 'http:' && isLoopbackOrigin(u.origin)
  } catch {
    return false
  }
}

function parseScopes(raw: string | undefined): string[] | null {
  const wanted = (raw ?? '').split(/\s+/).filter(Boolean)
  if (wanted.length === 0) return [...ALL_SCOPES]
  for (const s of wanted) if (!(ALL_SCOPES as readonly string[]).includes(s)) return null
  return [...new Set(wanted)]
}

function field(body: Record<string, unknown>, name: string): string | undefined {
  const v = body[name]
  return typeof v === 'string' ? v : undefined
}

/** Registers the built-in desktop client (idempotent). */
export function ensureBuiltinClients(deps: Pick<AppDeps, 'repo'>): void {
  if (deps.repo.getClient(DESKTOP_CLIENT_ID)) return
  deps.repo.putClient({ client_id: DESKTOP_CLIENT_ID, client_secret_hash: null, client_name: 'Quill', redirect_uris: ['http://127.0.0.1/callback'], token_endpoint_auth_method: 'none', builtin: true })
}

export function oauthRoutes(deps: AppDeps): Hono<Env> {
  const { repo, signer, identity, config, now } = deps
  const issuer = config.issuer
  const app = new Hono<Env>()
  const callbackUri = `${issuer}/auth/callback`

  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [...ALL_SCOPES],
    service_documentation: 'https://github.com/harshramani00/quill'
  }
  const resourceMetadata = {
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [...ALL_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Quill Cloud'
  }

  app.get('/.well-known/oauth-authorization-server', (c) => c.json(metadata))
  app.get('/.well-known/oauth-authorization-server/mcp', (c) => c.json(metadata))
  app.get('/.well-known/openid-configuration', (c) => c.json(metadata))
  app.get('/.well-known/oauth-protected-resource', (c) => c.json(resourceMetadata))
  app.get('/.well-known/oauth-protected-resource/mcp', (c) => c.json(resourceMetadata))

  /* ---------- Dynamic client registration (RFC 7591) ---------- */

  app.post('/oauth/register', async (c) => {
    const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
    if (repo.countRegisterAttempts(ip, now() - 3_600_000) >= REGISTER_LIMIT_PER_HOUR) return c.json({ error: 'too_many_requests', error_description: 'Try again later' }, 429)
    repo.recordRegisterAttempt(ip)
    let meta
    try {
      meta = OAuthClientMetadataSchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'invalid_client_metadata', error_description: 'Malformed client metadata' }, 400)
    }
    if (!meta.redirect_uris.length || !meta.redirect_uris.every(validRedirectUri)) return c.json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https URLs or loopback http URLs' }, 400)
    const method = meta.token_endpoint_auth_method ?? 'none'
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) return c.json({ error: 'invalid_client_metadata', error_description: 'Unsupported token_endpoint_auth_method' }, 400)
    const grantTypes = meta.grant_types ?? ['authorization_code']
    if (grantTypes.some((g) => g !== 'authorization_code' && g !== 'refresh_token')) return c.json({ error: 'invalid_client_metadata', error_description: 'Only authorization_code and refresh_token are supported' }, 400)
    const clientId = crypto.randomUUID()
    const secret = method === 'none' ? null : random(32)
    const name = (meta.client_name ?? 'Connected app').trim().slice(0, 80) || 'Connected app'
    repo.putClient({ client_id: clientId, client_secret_hash: secret ? hash(secret) : null, client_name: name, redirect_uris: meta.redirect_uris, token_endpoint_auth_method: method, builtin: false })
    return c.json(
      {
        client_id: clientId,
        ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: Math.floor(now() / 1000),
        client_name: name,
        redirect_uris: meta.redirect_uris,
        token_endpoint_auth_method: method,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: ALL_SCOPES.join(' ')
      },
      201
    )
  })

  /* ---------- Authorisation ---------- */

  app.get('/oauth/authorize', (c) => {
    const q = c.req.query()
    const client = q.client_id ? repo.getClient(q.client_id) : null
    if (!client) return c.html(errorPage('Unknown app', 'This app is not registered with this Quill server.'), 400)
    const redirectUri = q.redirect_uri ?? ''
    if (!redirectAllowed(client, redirectUri)) return c.html(errorPage('Bad redirect address', 'The app asked to be sent to an address it did not register.'), 400)
    const fail = (error: string, description: string): Response => {
      const u = new URL(redirectUri)
      u.searchParams.set('error', error)
      u.searchParams.set('error_description', description)
      if (q.state) u.searchParams.set('state', q.state)
      return c.redirect(u.toString(), 302)
    }
    if (q.response_type !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported')
    if (!q.code_challenge || (q.code_challenge_method ?? 'S256') !== 'S256') return fail('invalid_request', 'PKCE with S256 is required')
    const scopes = parseScopes(q.scope)
    if (!scopes) return fail('invalid_scope', `Supported scopes: ${ALL_SCOPES.join(' ')}`)
    if (q.resource && q.resource !== issuer && !q.resource.startsWith(`${issuer}/`)) return fail('invalid_target', 'Unknown resource')
    const state = random(24)
    const nonce = random(24)
    repo.putLoginState({
      state,
      nonce,
      params: { client_id: client.client_id, redirect_uri: redirectUri, scope: scopes.join(' '), code_challenge: q.code_challenge, resource: q.resource ?? '', client_state: q.state ?? '' },
      userId: null,
      expiresAt: now() + LOGIN_STATE_TTL_MS
    })
    return c.redirect(identity.authorizeUrl({ state, nonce, redirectUri: callbackUri }), 302)
  })

  // Local stand-in for Google when QUILL_DEV_LOGIN is on.
  app.get('/auth/dev', (c) => {
    if (identity.kind !== 'dev') return c.notFound()
    const { state, nonce } = c.req.query()
    if (!state || !nonce) return c.html(errorPage('Missing state', 'Start again from the app.'), 400)
    return c.html(devLoginPage({ state, nonce, action: '/auth/dev' }))
  })
  app.post('/auth/dev', async (c) => {
    if (identity.kind !== 'dev') return c.notFound()
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const state = field(body, 'state') ?? ''
    const code = DevIdentityProvider.encodeCode({ email: field(body, 'email') ?? '', name: field(body, 'name') ?? '', nonce: field(body, 'nonce') ?? '' })
    const u = new URL(callbackUri)
    u.searchParams.set('state', state)
    u.searchParams.set('code', code)
    return c.redirect(u.toString(), 302)
  })

  /** Issues a code for a pending login and sends the browser back to the client. */
  const finish = (c: Context<Env>, login: { state: string; params: Record<string, string>; userId: string }): Response => {
    const p = login.params
    const code = random(32)
    repo.putAuthCode({ code_hash: hash(code), client_id: p.client_id, user_id: login.userId, redirect_uri: p.redirect_uri, scope: p.scope, code_challenge: p.code_challenge, resource: p.resource || null, expires_at: now() + CODE_TTL_MS })
    repo.deleteLoginState(login.state)
    const u = new URL(p.redirect_uri)
    u.searchParams.set('code', code)
    if (p.client_state) u.searchParams.set('state', p.client_state)
    return c.redirect(u.toString(), 302)
  }

  app.get('/auth/callback', async (c) => {
    const q = c.req.query()
    const login = q.state ? repo.takeLoginState(q.state) : null
    if (!login || login.expiresAt < now()) return c.html(errorPage('Sign-in expired', 'Please start again from the app.'), 400)
    if (q.error || !q.code) {
      repo.deleteLoginState(login.state)
      return c.html(errorPage('Sign-in cancelled', 'No account was selected.'), 400)
    }
    let who
    try {
      who = await identity.exchange({ code: q.code, nonce: login.nonce, redirectUri: callbackUri })
    } catch (err) {
      deps.log('identity exchange failed', err)
      return c.html(errorPage('Sign-in failed', 'The identity provider did not confirm your account. Please try again.'), 400)
    }
    if (config.allowedEmails.length && !config.allowedEmails.includes(who.email.toLowerCase())) {
      repo.deleteLoginState(login.state)
      return c.html(errorPage('Not on the list', `This Quill server is private. Ask its owner to add ${who.email}.`), 403)
    }
    const user = repo.upsertUser({ googleSub: who.sub, email: who.email, name: who.name })
    const client = repo.getClient(login.params.client_id)
    if (!client) return c.html(errorPage('Unknown app', 'The app that started this sign-in is no longer registered.'), 400)
    if (client.builtin) return finish(c, { state: login.state, params: login.params, userId: user.id })
    repo.updateLoginStateUser(login.state, user.id)
    const retry = new URL(`${issuer}/oauth/authorize`)
    for (const [k, v] of Object.entries({ client_id: login.params.client_id, redirect_uri: login.params.redirect_uri, response_type: 'code', scope: login.params.scope, code_challenge: login.params.code_challenge, code_challenge_method: 'S256', state: login.params.client_state, resource: login.params.resource })) if (v) retry.searchParams.set(k, v)
    return c.html(consentPage({ clientName: client.client_name, userName: user.name, userEmail: user.email, scopes: login.params.scope.split(' '), state: login.state, decisionPath: '/oauth/authorize/decision', switchAccountUrl: retry.toString() }))
  })

  app.post('/oauth/authorize/decision', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const state = field(body, 'state') ?? ''
    const login = state ? repo.takeLoginState(state) : null
    if (!login || !login.userId || login.expiresAt < now()) return c.html(errorPage('Sign-in expired', 'Please start again from the app.'), 400)
    if (field(body, 'decision') !== 'allow') {
      repo.deleteLoginState(login.state)
      const u = new URL(login.params.redirect_uri)
      u.searchParams.set('error', 'access_denied')
      if (login.params.client_state) u.searchParams.set('state', login.params.client_state)
      return c.redirect(u.toString(), 302)
    }
    return finish(c, { state: login.state, params: login.params, userId: login.userId })
  })

  /* ---------- Tokens ---------- */

  const tokenError = (c: Context<Env>, error: string, description: string, status: 400 | 401 = 400): Response => c.json({ error, error_description: description }, status)

  /** Resolves and authenticates the client for /oauth/token and /oauth/revoke. */
  const authenticateClient = (c: Context<Env>, body: Record<string, unknown>): OAuthClientRow | null => {
    let clientId = field(body, 'client_id')
    let secret = field(body, 'client_secret')
    const basic = /^Basic\s+(.+)$/i.exec(c.req.header('authorization') ?? '')
    if (basic) {
      const [id, ...rest] = Buffer.from(basic[1], 'base64').toString('utf8').split(':')
      clientId = decodeURIComponent(id)
      secret = decodeURIComponent(rest.join(':'))
    }
    const client = clientId ? repo.getClient(clientId) : null
    if (!client) return null
    if (client.token_endpoint_auth_method === 'none') return client
    if (!secret || !client.client_secret_hash) return null
    const a = Buffer.from(hash(secret))
    const b = Buffer.from(client.client_secret_hash)
    return a.length === b.length && timingSafeEqual(a, b) ? client : null
  }

  const issueTokens = async (grant: { id: string; user_id: string; client_id: string; scope: string }): Promise<Record<string, unknown>> => {
    const refresh = random(32)
    const ttl = grant.client_id === DESKTOP_CLIENT_ID ? REFRESH_TTL_DESKTOP_MS : REFRESH_TTL_OTHER_MS
    repo.putRefreshToken({ tokenHash: hash(refresh), grantId: grant.id, expiresAt: now() + ttl })
    const access = await signer.sign({ sub: grant.user_id, gid: grant.id, cid: grant.client_id, scope: grant.scope }, now())
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SEC, refresh_token: refresh, scope: grant.scope }
  }

  app.post('/oauth/token', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const client = authenticateClient(c, body)
    if (!client) return tokenError(c, 'invalid_client', 'Unknown client or bad credentials', 401)
    const grantType = field(body, 'grant_type')

    if (grantType === 'authorization_code') {
      const code = field(body, 'code')
      const verifier = field(body, 'code_verifier')
      const redirectUri = field(body, 'redirect_uri')
      if (!code || !verifier) return tokenError(c, 'invalid_request', 'code and code_verifier are required')
      const row = repo.getAuthCode(hash(code))
      if (!row || row.client_id !== client.client_id) return tokenError(c, 'invalid_grant', 'Unknown code')
      if (row.used_at !== null || row.expires_at < now()) return tokenError(c, 'invalid_grant', 'Code already used or expired')
      if (redirectUri !== undefined && redirectUri !== row.redirect_uri) return tokenError(c, 'invalid_grant', 'redirect_uri does not match')
      if (!pkceMatches(verifier, row.code_challenge)) return tokenError(c, 'invalid_grant', 'PKCE verification failed')
      repo.markAuthCodeUsed(row.code_hash)
      const grant = repo.createGrant({ userId: row.user_id, clientId: client.client_id, clientName: client.client_name, scope: row.scope })
      return c.json(await issueTokens(grant))
    }

    if (grantType === 'refresh_token') {
      const token = field(body, 'refresh_token')
      if (!token) return tokenError(c, 'invalid_request', 'refresh_token is required')
      const row = repo.getRefreshToken(hash(token))
      if (!row) return tokenError(c, 'invalid_grant', 'Unknown refresh token')
      const grant = repo.getGrant(row.grant_id)
      if (!grant || grant.client_id !== client.client_id) return tokenError(c, 'invalid_grant', 'Unknown refresh token')
      if (row.used_at !== null) {
        // A replayed refresh token means it leaked: cut off the whole grant.
        repo.revokeGrant(grant.id)
        return tokenError(c, 'invalid_grant', 'Refresh token reuse detected; access revoked')
      }
      if (grant.revoked_at !== null) return tokenError(c, 'invalid_grant', 'Access has been revoked')
      if (row.expires_at < now()) return tokenError(c, 'invalid_grant', 'Refresh token expired')
      const requested = field(body, 'scope')
      if (requested && requested.split(/\s+/).some((s) => !grant.scope.split(' ').includes(s))) return tokenError(c, 'invalid_scope', 'Cannot widen the scope on refresh')
      const tokens = await issueTokens(grant)
      repo.rotateRefreshToken(row.token_hash, hash(tokens.refresh_token as string))
      return c.json(tokens)
    }

    return tokenError(c, 'unsupported_grant_type', 'Use authorization_code or refresh_token')
  })

  app.post('/oauth/revoke', async (c) => {
    const body = (await c.req.parseBody()) as Record<string, unknown>
    const client = authenticateClient(c, body)
    const token = field(body, 'token')
    if (client && token) {
      const refresh = repo.getRefreshToken(hash(token))
      if (refresh) {
        const grant = repo.getGrant(refresh.grant_id)
        if (grant && grant.client_id === client.client_id) repo.revokeGrant(grant.id)
      } else {
        try {
          const claims = await signer.verify(token, now())
          if (claims.cid === client.client_id) repo.revokeGrant(claims.gid)
        } catch {
          /* RFC 7009: unknown tokens are not an error */
        }
      }
    }
    return c.body(null, 200)
  })

  /** Shown by the desktop app's loopback server after a successful sign-in (served here so it is styled). */
  app.get('/auth/done', (c) => c.html(desktopDonePage()))

  return app
}
