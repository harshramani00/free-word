import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CloudDoc } from '../../src/shared/cloud'
import { ISSUER, auth, signIn, testServer, upload, uploadVersion } from './helpers'
import type { Session, TestServer } from './helpers'

/*
 * Two people, one server. Everything Alice owns must be invisible to Bob: not
 * forbidden, invisible — the same 404 a made-up id would get.
 */

let t: TestServer
let alice: Session
let bob: Session
let doc: CloudDoc
beforeEach(async () => {
  t = await testServer()
  alice = await signIn(t, { sub: 'google:1', email: 'alice@example.com', name: 'Alice' })
  bob = await signIn(t, { sub: 'google:2', email: 'bob@example.com', name: 'Bob' })
  doc = (await (await upload(t, alice, { name: 'Private', json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'secret' }] }] } })).json()) as CloudDoc
})
afterEach(() => t.cleanup())

const asBob = async (path: string, init?: RequestInit): Promise<Response> => t.app.request(`${ISSUER}/api/v1${path}`, { ...init, headers: { ...auth(bob), ...(init?.headers as Record<string, string> | undefined) } })

describe('cross-user isolation', () => {
  const table: [string, string, RequestInit | undefined][] = [
    ['GET', '/documents/:id', undefined],
    ['PATCH', '/documents/:id', { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'pwned' }) }],
    ['DELETE', '/documents/:id', undefined],
    ['POST', '/documents/:id/restore', undefined],
    ['GET', '/documents/:id/versions', undefined],
    ['GET', '/documents/:id/versions/1/content', undefined],
    ['POST', '/documents/:id/versions/1/restore', undefined]
  ]

  for (const [method, path, init] of table) {
    it(`${method} ${path} → 404 for another user`, async () => {
      const r = await asBob(path.replace(':id', doc.id), { ...init, method })
      expect(r.status).toBe(404)
      const made = await asBob(path.replace(':id', crypto.randomUUID()), { ...init, method })
      expect(made.status).toBe(404)
    })
  }

  it('uploading a version to another user’s document is a 404 and changes nothing', async () => {
    expect((await uploadVersion(t, bob, doc.id)).status).toBe(404)
    const mine = (await (await t.app.request(`${ISSUER}/api/v1/documents/${doc.id}`, { headers: auth(alice) })).json()) as CloudDoc
    expect(mine.currentVersion).toBe(1)
  })

  it('lists, changes and connected apps are per user', async () => {
    expect(await (await asBob('/documents')).json()).toEqual([])
    expect(((await (await asBob('/changes?since=0')).json()) as { changes: unknown[] }).changes).toEqual([])
    const apps = (await (await asBob('/connected-apps')).json()) as { id: string }[]
    expect(apps).toHaveLength(1)
    const aliceApps = (await (await t.app.request(`${ISSUER}/api/v1/connected-apps`, { headers: auth(alice) })).json()) as { id: string }[]
    expect((await asBob(`/connected-apps/${aliceApps[0].id}`, { method: 'DELETE' })).status).toBe(404)
    expect((await t.app.request(`${ISSUER}/api/v1/me`, { headers: auth(alice) })).status).toBe(200)
  })

  it('blobs live under the owner’s directory only', async () => {
    await expect(t.deps.blobs.read(alice.userId, doc.id, 1)).resolves.toBeTruthy()
    await expect(t.deps.blobs.read(bob.userId, doc.id, 1)).rejects.toThrow()
  })
})
