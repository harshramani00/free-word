import { Hono } from 'hono'
import type { AccountInfo } from '../../../src/shared/cloud'
import { SCOPE_WRITE } from '../../../src/shared/cloud'
import { requireScope } from '../auth/middleware'
import { HttpError } from '../service/documents'
import type { AppDeps, Env } from '../types'

export function accountRoutes(deps: AppDeps): Hono<Env> {
  const { repo, config } = deps
  const app = new Hono<Env>()

  app.get('/me', (c) => {
    const user = repo.getUser(c.var.auth.userId)
    if (!user) throw new HttpError(401, 'invalid_token', 'Unknown account')
    const info: AccountInfo = { id: user.id, email: user.email, name: user.name, quotaBytes: config.quotaBytes, usedBytes: repo.usedBytes(user.id) }
    return c.json(info)
  })

  app.get('/connected-apps', (c) => c.json(repo.listConnectedApps(c.var.auth.userId)))

  app.delete('/connected-apps/:id', requireScope(SCOPE_WRITE), (c) => {
    if (!repo.revokeUserGrant(c.var.auth.userId, c.req.param('id'))) throw new HttpError(404, 'not_found', 'No such connected app')
    return c.body(null, 204)
  })

  return app
}
