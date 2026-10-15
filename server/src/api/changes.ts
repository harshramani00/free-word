import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppDeps, Env } from '../types'

const HEARTBEAT_MS = 25_000

export function changeRoutes(deps: AppDeps): Hono<Env> {
  const { docs, bus } = deps
  const app = new Hono<Env>()

  app.get('/changes', (c) => {
    const since = Number(c.req.query('since') ?? 0)
    return c.json(docs.changes(c.var.auth.userId, Number.isFinite(since) && since >= 0 ? since : 0))
  })

  /**
   * One event per change: `event: change`, `id: <seq>`, data `{seq, docId, kind}`.
   * The client re-fetches /changes?since=<its cursor> on each event, so a missed
   * event costs nothing; Last-Event-ID (or ?since) replays what happened meanwhile.
   */
  app.get('/changes/stream', (c) => {
    const userId = c.var.auth.userId
    const lastId = c.req.header('last-event-id') ?? c.req.query('since')
    const since = lastId !== undefined && Number.isFinite(Number(lastId)) ? Number(lastId) : null
    return streamSSE(c, async (stream) => {
      let open = true
      const unsubscribe = bus.subscribe(userId, (ev) => {
        if (!open) return
        void stream.writeSSE({ event: 'change', id: String(ev.seq), data: JSON.stringify(ev) })
      })
      stream.onAbort(() => {
        open = false
        unsubscribe()
      })
      if (since !== null) {
        for (const ch of docs.changes(userId, since).changes) await stream.writeSSE({ event: 'change', id: String(ch.seq), data: JSON.stringify({ seq: ch.seq, docId: ch.manifest.id, kind: ch.kind }) })
      }
      await stream.writeSSE({ event: 'ready', data: String(docs.changes(userId, Number.MAX_SAFE_INTEGER).cursor) })
      while (open) {
        await stream.sleep(HEARTBEAT_MS)
        if (open) await stream.writeSSE({ event: 'ping', data: '' })
      }
    })
  })

  return app
}
