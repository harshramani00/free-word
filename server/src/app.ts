import { Hono } from 'hono'
import { accountRoutes } from './api/account'
import { changeRoutes } from './api/changes'
import { documentRoutes } from './api/documents'
import { requireBearer } from './auth/middleware'
import { ensureBuiltinClients, oauthRoutes } from './auth/oauth'
import { mcpRoutes } from './mcp/server'
import { HttpError } from './service/documents'
import type { AppDeps, Env } from './types'

/**
 * Assembles the HTTP app from injected dependencies so tests can run it with an
 * in-memory database, a temp blob directory and a fake identity provider.
 */
export function createApp(deps: AppDeps): Hono<Env> {
  ensureBuiltinClients(deps)
  const app = new Hono<Env>()

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.code, error_description: err.message }, err.status as 400)
    deps.log('unhandled error', c.req.method, c.req.path, err)
    return c.json({ error: 'server_error', error_description: 'Something went wrong on the server' }, 500)
  })
  app.notFound((c) => c.json({ error: 'not_found', error_description: 'No such route' }, 404))

  app.get('/healthz', (c) => c.json({ ok: true, name: 'quill-cloud' }))
  app.route('/', oauthRoutes(deps))
  app.route('/', mcpRoutes(deps))

  const api = new Hono<Env>()
  api.use('*', requireBearer(deps))
  api.route('/', accountRoutes(deps))
  api.route('/', documentRoutes(deps))
  api.route('/', changeRoutes(deps))
  app.route('/api/v1', api)

  return app
}
