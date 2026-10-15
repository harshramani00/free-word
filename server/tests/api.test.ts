import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Changes, CloudDoc, VersionInfo } from '../../src/shared/cloud'
import { importDocx } from '../../src/main/docx/import'
import { ISSUER, auth, doc, signIn, testServer, upload, uploadVersion } from './helpers'
import type { Session, TestServer } from './helpers'

const alice = { sub: 'google:1', email: 'alice@example.com', name: 'Alice' }

let t: TestServer
let s: Session
beforeEach(async () => {
  t = await testServer()
  s = await signIn(t, alice)
})
afterEach(() => t.cleanup())

const api = async (path: string, init?: RequestInit): Promise<Response> => t.app.request(`${ISSUER}/api/v1${path}`, { ...init, headers: { ...auth(s), ...(init?.headers as Record<string, string> | undefined) } })

describe('documents', () => {
  it('creates, lists, downloads and versions a document', async () => {
    const created = await upload(t, s, { name: 'Garden Plan 2027.docx', path: '/Garden Club/', note: 'first draft' })
    expect(created.status).toBe(201)
    const m = (await created.json()) as CloudDoc
    expect(m).toMatchObject({ name: 'Garden Plan 2027', path: 'Garden Club', currentVersion: 1, updatedBy: 'user', note: 'first draft', deletedAt: null })
    expect(m.sha256).toHaveLength(64)

    const list = (await (await api('/documents')).json()) as CloudDoc[]
    expect(list.map((d) => d.id)).toEqual([m.id])

    const v2 = await uploadVersion(t, s, m.id, { json: doc('Second version'), base: 1, note: 'edited on the Mac' })
    expect(v2.status).toBe(201)
    expect(((await v2.json()) as CloudDoc).currentVersion).toBe(2)

    const versions = (await (await api(`/documents/${m.id}/versions`)).json()) as VersionInfo[]
    expect(versions.map((v) => v.n)).toEqual([2, 1])
    expect(versions[0]).toMatchObject({ baseVersion: 1, note: 'edited on the Mac', updatedBy: 'user' })

    const content = await api(`/documents/${m.id}/versions/2/content`)
    expect(content.status).toBe(200)
    expect(content.headers.get('etag')).toBe(`"${versions[0].sha256}"`)
    const { html } = await importDocx(Buffer.from(await content.arrayBuffer()))
    expect(html).toContain('Second version')

    const cached = await api(`/documents/${m.id}/versions/2/content`, { headers: { 'if-none-match': `"${versions[0].sha256}"` } })
    expect(cached.status).toBe(304)
  })

  it('rejects bodies that are not docx and names that are missing', async () => {
    const r = await api('/documents', { method: 'POST', headers: { 'x-quill-name': 'x' }, body: 'not a zip' })
    expect(r.status).toBe(400)
    const r2 = await api('/documents', { method: 'POST', body: new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]) })
    expect(r2.status).toBe(400)
  })

  it('renames, soft-deletes, undeletes and restores versions', async () => {
    const m = (await (await upload(t, s, { name: 'Letter' })).json()) as CloudDoc
    const renamed = (await (await api(`/documents/${m.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lease Letter', path: 'Home' }) })).json()) as CloudDoc
    expect(renamed).toMatchObject({ name: 'Lease Letter', path: 'Home' })

    expect((await api(`/documents/${m.id}`, { method: 'DELETE' })).status).toBe(204)
    expect(((await (await api('/documents')).json()) as CloudDoc[]).length).toBe(0)
    expect(((await (await api('/documents?includeDeleted=true')).json()) as CloudDoc[])[0].deletedAt).not.toBeNull()
    expect((await uploadVersion(t, s, m.id)).status).toBe(404)

    const undeleted = (await (await api(`/documents/${m.id}/restore`, { method: 'POST' })).json()) as CloudDoc
    expect(undeleted.deletedAt).toBeNull()

    await uploadVersion(t, s, m.id, { json: doc('v2') })
    const restored = (await (await api(`/documents/${m.id}/versions/1/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note: 'back to the first' }) })).json()) as CloudDoc
    expect(restored.currentVersion).toBe(3)
    const v3 = await api(`/documents/${m.id}/versions/3/content`)
    const { html } = await importDocx(Buffer.from(await v3.arrayBuffer()))
    expect(html).toContain('Hello from the test')
    const versions = (await (await api(`/documents/${m.id}/versions`)).json()) as VersionInfo[]
    expect(versions[0]).toMatchObject({ n: 3, baseVersion: 1, note: 'back to the first' })
  })

  it('keeps only the newest 30 versions and removes the old blobs', async () => {
    const m = (await (await upload(t, s, { name: 'Busy' })).json()) as CloudDoc
    for (let i = 2; i <= 32; i++) expect((await uploadVersion(t, s, m.id, { json: doc(`v${i}`) })).status).toBe(201)
    const versions = (await (await api(`/documents/${m.id}/versions`)).json()) as VersionInfo[]
    expect(versions).toHaveLength(30)
    expect(versions[versions.length - 1].n).toBe(3)
    expect((await api(`/documents/${m.id}/versions/1/content`)).status).toBe(404)
    await expect(t.deps.blobs.read(s.userId, m.id, 1)).rejects.toThrow()
    await expect(t.deps.blobs.read(s.userId, m.id, 32)).resolves.toBeTruthy()
  })

  it('enforces the storage quota', async () => {
    await t.cleanup()
    t = await testServer({ quotaBytes: 15000 })
    s = await signIn(t, alice)
    expect((await upload(t, s, { name: 'one' })).status).toBe(201)
    const second = await upload(t, s, { name: 'two' })
    expect(second.status).toBe(413)
    expect(((await second.json()) as { error: string }).error).toBe('quota_exceeded')
  })
})

describe('changes', () => {
  it('reports a cursor and coalesces changes per document', async () => {
    const start = (await (await api('/changes?since=0')).json()) as Changes
    expect(start).toEqual({ cursor: 0, changes: [] })

    const a = (await (await upload(t, s, { name: 'A' })).json()) as CloudDoc
    const b = (await (await upload(t, s, { name: 'B' })).json()) as CloudDoc
    await uploadVersion(t, s, a.id)
    await api(`/documents/${b.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'B2' }) })

    const all = (await (await api('/changes?since=0')).json()) as Changes
    expect(all.changes.map((c) => [c.manifest.id, c.kind])).toEqual([
      [a.id, 'version'],
      [b.id, 'rename']
    ])
    expect(all.changes[0].manifest.currentVersion).toBe(2)
    expect(all.cursor).toBe(4)

    const none = (await (await api(`/changes?since=${all.cursor}`)).json()) as Changes
    expect(none.changes).toEqual([])
    expect(none.cursor).toBe(4)

    await api(`/documents/${a.id}`, { method: 'DELETE' })
    const after = (await (await api(`/changes?since=${all.cursor}`)).json()) as Changes
    expect(after.changes.map((c) => [c.manifest.id, c.kind])).toEqual([[a.id, 'delete']])
    expect(after.changes[0].manifest.deletedAt).not.toBeNull()
  })

  it('streams change events over SSE', async () => {
    const controller = new AbortController()
    const res = await t.app.request(`${ISSUER}/api/v1/changes/stream`, { headers: auth(s), signal: controller.signal })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''
    const readUntil = async (needle: string): Promise<void> => {
      while (!text.includes(needle)) {
        const { value, done } = await reader.read()
        if (done) throw new Error('stream ended')
        text += decoder.decode(value)
      }
    }
    await readUntil('event: ready')
    const m = (await (await upload(t, s, { name: 'Streamed' })).json()) as CloudDoc
    await readUntil('event: change')
    expect(text).toContain(`"docId":"${m.id}"`)
    controller.abort()
    await reader.cancel().catch(() => {})
  })
})
