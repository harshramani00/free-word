import { Hono } from 'hono'
import { DOCX_MIME, HEADER_BASE_VERSION, HEADER_NAME, HEADER_NOTE, HEADER_PATH, SCOPE_WRITE } from '../../../src/shared/cloud'
import { requireScope } from '../auth/middleware'
import { HttpError } from '../service/documents'
import type { AppDeps, Env } from '../types'

/** Reads a .docx body, enforcing the size cap before and after buffering. */
async function readDocx(c: { req: { header(name: string): string | undefined; arrayBuffer(): Promise<ArrayBuffer> } }, max: number): Promise<Buffer> {
  const declared = Number(c.req.header('content-length') ?? 0)
  if (declared > max) throw new HttpError(413, 'too_large', `Documents up to ${Math.floor(max / 1024 / 1024)} MB can be synced`)
  const bytes = Buffer.from(await c.req.arrayBuffer())
  if (bytes.byteLength > max) throw new HttpError(413, 'too_large', `Documents up to ${Math.floor(max / 1024 / 1024)} MB can be synced`)
  if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new HttpError(400, 'not_docx', 'The body is not a .docx file')
  return bytes
}

function header(c: { req: { header(name: string): string | undefined } }, name: string): string | null {
  const v = c.req.header(name)
  if (v === undefined) return null
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

export function documentRoutes(deps: AppDeps): Hono<Env> {
  const { docs, config } = deps
  const app = new Hono<Env>()

  app.get('/documents', (c) => c.json(docs.list(c.var.auth.userId, c.req.query('includeDeleted') === 'true')))

  app.post('/documents', requireScope(SCOPE_WRITE), async (c) => {
    const bytes = await readDocx(c, config.maxUploadBytes)
    const name = header(c, HEADER_NAME)
    if (!name) throw new HttpError(400, 'invalid_name', `${HEADER_NAME} header is required`)
    const doc = await docs.create(c.var.auth.userId, { name, path: header(c, HEADER_PATH) ?? '', bytes, updatedBy: 'user', note: header(c, HEADER_NOTE) })
    return c.json(doc, 201)
  })

  app.get('/documents/:id', (c) => c.json(docs.get(c.var.auth.userId, c.req.param('id'))))

  app.patch('/documents/:id', requireScope(SCOPE_WRITE), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { name?: unknown; path?: unknown }
    const patch: { name?: string; path?: string } = {}
    if (typeof body.name === 'string') patch.name = body.name
    if (typeof body.path === 'string') patch.path = body.path
    if (!('name' in patch) && !('path' in patch)) throw new HttpError(400, 'invalid_request', 'Provide name and/or path')
    return c.json(docs.rename(c.var.auth.userId, c.req.param('id'), patch))
  })

  app.delete('/documents/:id', requireScope(SCOPE_WRITE), (c) => {
    docs.softDelete(c.var.auth.userId, c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/documents/:id/restore', requireScope(SCOPE_WRITE), (c) => c.json(docs.undelete(c.var.auth.userId, c.req.param('id'))))

  app.post('/documents/:id/versions', requireScope(SCOPE_WRITE), async (c) => {
    const bytes = await readDocx(c, config.maxUploadBytes)
    const base = header(c, HEADER_BASE_VERSION)
    const doc = await docs.addVersion(c.var.auth.userId, c.req.param('id'), { bytes, updatedBy: 'user', note: header(c, HEADER_NOTE), baseVersion: base ? Number(base) : null })
    return c.json(doc, 201)
  })

  app.get('/documents/:id/versions', (c) => c.json(docs.versions(c.var.auth.userId, c.req.param('id'))))

  app.get('/documents/:id/versions/:n/content', async (c) => {
    const n = Number(c.req.param('n'))
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'invalid_request', 'Bad version number')
    const { version, bytes } = await docs.content(c.var.auth.userId, c.req.param('id'), n)
    const etag = `"${version.sha256}"`
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    c.header('ETag', etag)
    c.header('Content-Type', DOCX_MIME)
    c.header('Cache-Control', 'private, max-age=31536000, immutable')
    return c.body(new Uint8Array(bytes))
  })

  app.post('/documents/:id/versions/:n/restore', requireScope(SCOPE_WRITE), async (c) => {
    const n = Number(c.req.param('n'))
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'invalid_request', 'Bad version number')
    const body = (await c.req.json().catch(() => ({}))) as { note?: unknown }
    return c.json(await docs.restoreVersion(c.var.auth.userId, c.req.param('id'), n, { updatedBy: 'user', note: typeof body.note === 'string' ? body.note : null }))
  })

  return app
}
