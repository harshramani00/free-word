import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DESKTOP_CLIENT_ID } from '../../src/shared/cloud'
import { FakeIdentity, ISSUER, auth, form, pkce, signIn, testServer } from './helpers'
import type { TestServer } from './helpers'

const alice = { sub: 'google:1', email: 'alice@example.com', name: 'Alice' }

let t: TestServer
beforeEach(async () => {
  t = await testServer()
})
afterEach(() => t.cleanup())

async function registerClient(name = 'Claude', redirect = 'https://claude.ai/api/mcp/auth_callback'): Promise<{ client_id: string; client_secret?: string }> {
  const r = await t.app.request(`${ISSUER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'] }) })
  expect(r.status).toBe(201)
  return (await r.json()) as { client_id: string; client_secret?: string }
}

describe('discovery', () => {
  it('publishes authorization server and protected resource metadata', async () => {
    const as = (await (await t.app.request(`${ISSUER}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>
    expect(as.issuer).toBe(ISSUER)
    expect(as.code_challenge_methods_supported).toEqual(['S256'])
    expect(as.registration_endpoint).toBe(`${ISSUER}/oauth/register`)
    const pr = (await (await t.app.request(`${ISSUER}/.well-known/oauth-protected-resource/mcp`)).json()) as Record<string, unknown>
    expect(pr.resource).toBe(`${ISSUER}/mcp`)
    expect(pr.authorization_servers).toEqual([ISSUER])
  })

  it('answers an unauthenticated API call with a WWW-Authenticate challenge pointing at the metadata', async () => {
    const r = await t.app.request(`${ISSUER}/api/v1/me`)
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`)
  })
})

describe('authorization code flow', () => {
  it('signs the desktop client in without a consent page and returns working tokens', async () => {
    const s = await signIn(t, alice)
    const me = await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(s) })
    expect(me.status).toBe(200)
    expect(await me.json()).toMatchObject({ email: 'alice@example.com', name: 'Alice' })
  })

  it('accepts any loopback port for the desktop client but nothing else', async () => {
    await expect(signIn(t, alice, { redirectUri: 'http://127.0.0.1:61234/callback' })).resolves.toBeTruthy()
    await expect(signIn(t, alice, { redirectUri: 'http://localhost:61234/callback' })).resolves.toBeTruthy()
    await expect(signIn(t, alice, { redirectUri: 'https://evil.example/callback' })).rejects.toThrow(/400/)
    await expect(signIn(t, alice, { redirectUri: 'http://127.0.0.1:61234/other' })).rejects.toThrow(/400/)
  })

  it('requires PKCE and refuses unknown scopes', async () => {
    const noPkce = await t.app.request(`${ISSUER}/oauth/authorize?client_id=${DESKTOP_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://127.0.0.1:1/callback')}&response_type=code&state=s`)
    expect(noPkce.status).toBe(302)
    expect(noPkce.headers.get('location')).toContain('error=invalid_request')
    const { challenge } = pkce()
    const badScope = await t.app.request(`${ISSUER}/oauth/authorize?client_id=${DESKTOP_CLIENT_ID}&redirect_uri=${encodeURIComponent('http://127.0.0.1:1/callback')}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&scope=admin`)
    expect(badScope.headers.get('location')).toContain('error=invalid_scope')
  })

  it('rejects a wrong PKCE verifier, a reused code and a mismatched redirect_uri', async () => {
    const redirectUri = 'http://127.0.0.1:50000/callback'
    const { verifier, challenge } = pkce()
    const r1 = await t.app.request(`${ISSUER}/oauth/authorize?client_id=${DESKTOP_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256`)
    const state = new URL(r1.headers.get('location')!).searchParams.get('state')!
    const r2 = await t.app.request(`${ISSUER}/auth/callback?state=${state}&code=${FakeIdentity.code(alice)}`)
    const code = new URL(r2.headers.get('location')!).searchParams.get('code')!

    const wrongVerifier = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: pkce().verifier, redirect_uri: redirectUri, client_id: DESKTOP_CLIENT_ID }))
    expect(wrongVerifier.status).toBe(400)
    expect(((await wrongVerifier.json()) as { error: string }).error).toBe('invalid_grant')

    const wrongRedirect = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: 'http://127.0.0.1:1/callback', client_id: DESKTOP_CLIENT_ID }))
    expect(wrongRedirect.status).toBe(400)

    const ok = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: DESKTOP_CLIENT_ID }))
    expect(ok.status).toBe(200)

    const reused = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: DESKTOP_CLIENT_ID }))
    expect(reused.status).toBe(400)
  })

  it('enforces ALLOWED_EMAILS', async () => {
    await t.cleanup()
    t = await testServer({ allowedEmails: ['bob@example.com'] })
    await expect(signIn(t, alice)).rejects.toThrow(/403/)
    await expect(signIn(t, { sub: 'google:2', email: 'Bob@Example.com', name: 'Bob' })).resolves.toBeTruthy()
  })

  it('keeps one account per person across sign-ins', async () => {
    const a = await signIn(t, alice)
    const b = await signIn(t, { ...alice, name: 'Alice Renamed' })
    expect(a.userId).toBe(b.userId)
    const me = (await (await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(b) })).json()) as { name: string }
    expect(me.name).toBe('Alice Renamed')
  })
})

describe('registered clients (Claude)', () => {
  it('registers dynamically, shows the consent page, and only issues a code on Allow', async () => {
    const client = await registerClient()
    const denied = signIn(t, alice, { clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', consent: 'deny' })
    await expect(denied).rejects.toThrow(/no code.*access_denied/)
    const s = await signIn(t, alice, { clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback' })
    const apps = (await (await t.app.request(`${ISSUER}/api/v1/connected-apps`, { headers: auth(s) })).json()) as { clientName: string }[]
    expect(apps.map((a) => a.clientName)).toEqual(['Claude'])
  })

  it('refuses insecure redirect URIs and rate-limits registration', async () => {
    const bad = await t.app.request(`${ISSUER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['http://evil.example/cb'] }) })
    expect(bad.status).toBe(400)
    for (let i = 0; i < 9; i++) await registerClient(`c${i}`)
    const limited = await t.app.request(`${ISSUER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://x.example/cb'] }) })
    expect(limited.status).toBe(429)
  })

  it('a read-only grant cannot write', async () => {
    const client = await registerClient('Reader')
    const s = await signIn(t, alice, { clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', scope: 'documents:read' })
    const r = await t.app.request(`${ISSUER}/api/v1/documents`, { method: 'POST', headers: { ...auth(s), 'x-quill-name': 'x' }, body: new Uint8Array([0x50, 0x4b, 3, 4]) })
    expect(r.status).toBe(403)
  })
})

describe('refresh and revocation', () => {
  it('rotates refresh tokens and revokes the grant when an old one is replayed', async () => {
    const s = await signIn(t, alice)
    const r1 = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: DESKTOP_CLIENT_ID }))
    expect(r1.status).toBe(200)
    const t1 = (await r1.json()) as { access_token: string; refresh_token: string }
    expect(t1.refresh_token).not.toBe(s.refresh)

    const replay = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: DESKTOP_CLIENT_ID }))
    expect(replay.status).toBe(400)

    // The whole grant is dead now: the new refresh token and every access token stop working.
    const after = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: DESKTOP_CLIENT_ID }))
    expect(after.status).toBe(400)
    const me = await t.app.request(`${ISSUER}/api/v1/me`, { headers: { authorization: `Bearer ${t1.access_token}` } })
    expect(me.status).toBe(401)
  })

  it('expires access tokens after an hour and refresh tokens after their lifetime', async () => {
    const s = await signIn(t, alice)
    t.clock.advance(61 * 60_000)
    expect((await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(s) })).status).toBe(401)
    const refreshed = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token: s.refresh, client_id: DESKTOP_CLIENT_ID }))
    expect(refreshed.status).toBe(200)
    const { refresh_token } = (await refreshed.json()) as { refresh_token: string }
    t.clock.advance(91 * 86_400_000)
    const expired = await t.app.request(`${ISSUER}/oauth/token`, form({ grant_type: 'refresh_token', refresh_token, client_id: DESKTOP_CLIENT_ID }))
    expect(expired.status).toBe(400)
  })

  it('revoke endpoint and Disconnect both end access', async () => {
    const s = await signIn(t, alice)
    const r = await t.app.request(`${ISSUER}/oauth/revoke`, form({ token: s.refresh, client_id: DESKTOP_CLIENT_ID }))
    expect(r.status).toBe(200)
    expect((await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(s) })).status).toBe(401)

    const owner = await signIn(t, alice)
    const other = await signIn(t, alice)
    const apps = (await (await t.app.request(`${ISSUER}/api/v1/connected-apps`, { headers: auth(owner) })).json()) as { id: string }[]
    expect(apps).toHaveLength(2)
    const victim = apps.find((a) => a.id !== JSON.parse(Buffer.from(owner.access.split('.')[1], 'base64url').toString()).gid)!
    const del = await t.app.request(`${ISSUER}/api/v1/connected-apps/${victim.id}`, { method: 'DELETE', headers: auth(owner) })
    expect(del.status).toBe(204)
    expect((await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(other) })).status).toBe(401)
    expect((await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(owner) })).status).toBe(200)
  })
})
