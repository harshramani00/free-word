import type { Context, MiddlewareHandler } from 'hono'
import type { AppDeps, Env } from '../types'

const TOUCH_INTERVAL_MS = 60_000

export function resourceMetadataUrl(issuer: string): string {
  return `${issuer}/.well-known/oauth-protected-resource`
}

function challenge(c: Context<Env>, issuer: string, status: 401 | 403, error: string, description: string): Response {
  const parts = [`Bearer realm="quill"`, `error="${error}"`, `error_description="${description.replace(/"/g, "'")}"`, `resource_metadata="${resourceMetadataUrl(issuer)}"`]
  c.header('WWW-Authenticate', parts.join(', '))
  return c.json({ error, error_description: description }, status)
}

/**
 * Verifies the bearer token, checks the grant is still live and (optionally) that
 * it carries a scope, then exposes the caller as c.var.auth.
 */
export function requireBearer(deps: Pick<AppDeps, 'config' | 'repo' | 'signer' | 'now'>, scope?: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? ''
    const m = /^Bearer\s+(.+)$/i.exec(header.trim())
    if (!m) return challenge(c, deps.config.issuer, 401, 'invalid_token', 'A bearer token is required')
    let claims
    try {
      claims = await deps.signer.verify(m[1], deps.now())
    } catch {
      return challenge(c, deps.config.issuer, 401, 'invalid_token', 'The token is invalid or expired')
    }
    const grant = deps.repo.getGrant(claims.gid)
    if (!grant || grant.revoked_at !== null || grant.user_id !== claims.sub) return challenge(c, deps.config.issuer, 401, 'invalid_token', 'Access has been revoked')
    const scopes = claims.scope.split(' ').filter(Boolean)
    if (scope && !scopes.includes(scope)) return challenge(c, deps.config.issuer, 403, 'insufficient_scope', `This action needs the ${scope} permission`)
    if (grant.last_used_at === null || deps.now() - grant.last_used_at > TOUCH_INTERVAL_MS) deps.repo.touchGrant(grant.id)
    c.set('auth', { userId: claims.sub, grantId: claims.gid, clientId: claims.cid, scopes })
    await next()
  }
}

/** Route-level guard for write operations once requireBearer has run. */
export function requireScope(scope: string): MiddlewareHandler<Env> {
  return async (c, next) => {
    if (!c.var.auth.scopes.includes(scope)) return c.json({ error: 'insufficient_scope', error_description: `This action needs the ${scope} permission` }, 403)
    await next()
  }
}
