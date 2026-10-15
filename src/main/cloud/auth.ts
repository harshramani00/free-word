import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ALL_SCOPES, DESKTOP_CLIENT_ID } from '../../shared/cloud'
import { tokensFromResponse } from './client'
import type { TokenResponse } from './client'
import type { Tokens } from './store'

const TIMEOUT_MS = 5 * 60_000

/**
 * Desktop sign-in (RFC 8252): a one-shot loopback server receives the authorization
 * code while the user signs in with Google in their normal browser, then the code is
 * exchanged with PKCE. No client secret is involved.
 */
export async function signInWithBrowser(serverUrl: string, openExternal: (url: string) => Promise<void>, fetchFn: typeof fetch = fetch): Promise<Tokens> {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  return new Promise<Tokens>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      setTimeout(() => server.close(), 500)
    }
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      if (url.searchParams.get('state') !== state) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('State mismatch. Please try signing in again from Quill.')
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error || !code) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Sign-in was cancelled. You can close this tab.')
        finish(() => reject(new Error(error === 'access_denied' ? 'Sign-in cancelled' : `Sign-in failed: ${error ?? 'no code'}`)))
        return
      }
      try {
        const tokenRes = await fetchFn(`${serverUrl}/oauth/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: DESKTOP_CLIENT_ID }).toString()
        })
        if (!tokenRes.ok) throw new Error(`The server refused the sign-in (${tokenRes.status})`)
        const tokens = tokensFromResponse((await tokenRes.json()) as TokenResponse)
        res.writeHead(302, { location: `${serverUrl}/auth/done` }).end()
        finish(() => resolve(tokens))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'text/plain' }).end('Sign-in failed. Please try again from Quill.')
        finish(() => reject(err instanceof Error ? err : new Error(String(err))))
      }
    })
    let redirectUri = ''
    const timer = setTimeout(() => finish(() => reject(new Error('Sign-in timed out'))), TIMEOUT_MS)
    server.on('error', (err) => finish(() => reject(err)))
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      redirectUri = `http://127.0.0.1:${port}/callback`
      const u = new URL(`${serverUrl}/oauth/authorize`)
      u.searchParams.set('client_id', DESKTOP_CLIENT_ID)
      u.searchParams.set('redirect_uri', redirectUri)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('code_challenge', challenge)
      u.searchParams.set('code_challenge_method', 'S256')
      u.searchParams.set('scope', ALL_SCOPES.join(' '))
      u.searchParams.set('state', state)
      void openExternal(u.toString()).catch((err: unknown) => finish(() => reject(err instanceof Error ? err : new Error(String(err)))))
    })
  })
}

/** Normalises what the user typed into the server field: scheme, no trailing slash. */
export function normaliseServerUrl(input: string): string {
  let s = input.trim()
  if (!s) throw new Error('Enter your Quill Cloud server address')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  const u = new URL(s)
  if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('The server address must use https')
  return `${u.protocol}//${u.host}`
}
