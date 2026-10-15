import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { AddressInfo } from 'node:net'
import type { CloudDoc, VersionInfo } from '../../src/shared/cloud'
import { importDocx } from '../../src/main/docx/import'
import { ISSUER, auth, doc, signIn, testServer, upload } from './helpers'
import type { Session, TestServer } from './helpers'

/*
 * Drives the MCP endpoint the way Claude does: the official client over Streamable
 * HTTP with a bearer token, against the real app served on a loopback port.
 */

let t: TestServer
let alice: Session
let bob: Session
let http: ServerType
let base: string

beforeEach(async () => {
  t = await testServer()
  alice = await signIn(t, { sub: 'google:1', email: 'alice@example.com', name: 'Alice' })
  bob = await signIn(t, { sub: 'google:2', email: 'bob@example.com', name: 'Bob' })
  await new Promise<void>((resolve) => {
    http = serve({ fetch: t.app.fetch, hostname: '127.0.0.1', port: 0 }, (info: AddressInfo) => {
      base = `http://127.0.0.1:${info.port}`
      resolve()
    })
  })
})
afterEach(async () => {
  await new Promise<void>((resolve) => http.close(() => resolve()))
  await t.cleanup()
})

async function connect(s: Session): Promise<Client> {
  const client = new Client({ name: 'test', version: '0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { authorization: `Bearer ${s.access}` } } })
  await client.connect(transport)
  return client
}

const textOf = (r: unknown): string => (((r as { content?: unknown }).content as { type: string; text: string }[]) ?? []).map((c) => c.text).join("\n")

describe('mcp endpoint', () => {
  it('challenges unauthenticated clients with the protected-resource metadata', async () => {
    const r = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) })
    expect(r.status).toBe(401)
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata=')
  })

  it('lists the tools and round-trips create → insert → replace → read', async () => {
    const client = await connect(alice)
    const tools = (await client.listTools()).tools.map((x) => x.name).sort()
    expect(tools).toEqual(['create_document', 'get_document', 'insert_blocks', 'list_documents', 'list_versions', 'replace_blocks', 'replace_section', 'replace_text', 'restore_version'])

    const created = await client.callTool({ name: 'create_document', arguments: { name: 'Board Meeting Notes', folder: 'Garden Club', markdown: '# Board Meeting Notes\n\n## Attendance\n\nEveryone came.\n\n## Any other business\n\nNone.', note: 'Drafted from notes' } })
    expect(created.isError).toBeFalsy()
    const id = /id ([0-9a-f-]{36})/.exec(textOf(created))![1]

    const list = (await (await t.app.request(`${ISSUER}/api/v1/documents`, { headers: auth(alice) })).json()) as CloudDoc[]
    expect(list[0]).toMatchObject({ id, name: 'Board Meeting Notes', path: 'Garden Club', currentVersion: 1, updatedBy: 'claude', note: 'Drafted from notes' })

    const inserted = await client.callTool({ name: 'insert_blocks', arguments: { id, markdown: '## Budget vote\n\nMotion to approve the spring budget.', at: { afterHeading: 'Attendance', endOfSection: true }, note: 'Added budget vote', expectedVersion: 1 } })
    expect(inserted.isError).toBeFalsy()
    expect(textOf(inserted)).toContain('version 2')

    const stale = await client.callTool({ name: 'replace_text', arguments: { id, find: 'Everyone', replace: 'All members', expectedVersion: 1 } })
    expect(stale.isError).toBe(true)
    expect(textOf(stale)).toContain('version 2')

    const replaced = await client.callTool({ name: 'replace_text', arguments: { id, find: 'Everyone', replace: 'All members' } })
    expect(textOf(replaced)).toContain('version 3')

    const outline = textOf(await client.callTool({ name: 'get_document', arguments: { id, format: 'outline' } }))
    expect(outline).toContain('[0] h1: Board Meeting Notes')
    expect(outline).toContain('[3] h2: Budget vote')
    const md = textOf(await client.callTool({ name: 'get_document', arguments: { id } }))
    expect(md).toContain('All members came.')
    expect(md.indexOf('## Budget vote')).toBeLessThan(md.indexOf('## Any other business'))

    const versions = (await (await t.app.request(`${ISSUER}/api/v1/documents/${id}/versions`, { headers: auth(alice) })).json()) as VersionInfo[]
    expect(versions.map((v) => [v.n, v.updatedBy, v.baseVersion])).toEqual([
      [3, 'claude', 2],
      [2, 'claude', 1],
      [1, 'claude', null]
    ])

    // What Claude wrote is a real .docx that Quill's importer reads back.
    const bytes = Buffer.from(await (await t.app.request(`${ISSUER}/api/v1/documents/${id}/versions/3/content`, { headers: auth(alice) })).arrayBuffer())
    const { html } = await importDocx(bytes)
    expect(html).toContain('Budget vote')
    expect(html).toContain('All members came.')
    await client.close()
  })

  it('replace_section, replace_blocks and restore_version', async () => {
    const client = await connect(alice)
    const m = (await (await upload(t, alice, { name: 'Plan', json: doc('Intro') })).json()) as CloudDoc
    const ins = await client.callTool({ name: 'insert_blocks', arguments: { id: m.id, markdown: '## Costs\n\nold costs\n\n## Next steps\n\nlater', at: { position: 'end' } } })
    expect(ins.isError).toBeFalsy()
    const sec = await client.callTool({ name: 'replace_section', arguments: { id: m.id, heading: 'Costs', markdown: '| Item | Cost |\n| --- | --- |\n| Soil | $40 |' } })
    expect(sec.isError).toBeFalsy()
    const md = textOf(await client.callTool({ name: 'get_document', arguments: { id: m.id } }))
    expect(md).not.toContain('old costs')
    expect(md).toContain('| Soil | $40 |')
    expect(md).toContain('## Next steps')

    const bad = await client.callTool({ name: 'replace_blocks', arguments: { id: m.id, startIndex: 0, endIndex: 0, expectedText: 'Wrong', markdown: 'x' } })
    expect(bad.isError).toBe(true)
    const good = await client.callTool({ name: 'replace_blocks', arguments: { id: m.id, startIndex: 0, endIndex: 0, expectedText: 'Intro', markdown: 'Introduction' } })
    expect(good.isError).toBeFalsy()

    const restored = await client.callTool({ name: 'restore_version', arguments: { id: m.id, version: 1 } })
    expect(textOf(restored)).toContain('copy of version 1')
    const back = textOf(await client.callTool({ name: 'get_document', arguments: { id: m.id } }))
    expect(back).toContain('Intro')
    expect(back).not.toContain('Next steps')
    await client.close()
  })

  it('keeps users apart and respects read-only scope', async () => {
    const aliceDoc = (await (await upload(t, alice, { name: 'Secret' })).json()) as CloudDoc
    const bobClient = await connect(bob)
    expect(textOf(await bobClient.callTool({ name: 'list_documents', arguments: {} }))).toBe('No documents yet.')
    for (const [name, args] of [
      ['get_document', { id: aliceDoc.id }],
      ['replace_text', { id: aliceDoc.id, find: 'Hello', replace: 'pwned' }],
      ['insert_blocks', { id: aliceDoc.id, markdown: 'x', at: { position: 'end' } }],
      ['replace_blocks', { id: aliceDoc.id, startIndex: 0, endIndex: 0, markdown: 'x' }],
      ['replace_section', { id: aliceDoc.id, heading: 'x', markdown: 'x' }],
      ['list_versions', { id: aliceDoc.id }],
      ['restore_version', { id: aliceDoc.id, version: 1 }]
    ] as const) {
      const r = await bobClient.callTool({ name, arguments: args as Record<string, unknown> })
      expect(r.isError, name).toBe(true)
      expect(textOf(r), name).toContain('No such document')
    }
    const mine = (await (await t.app.request(`${ISSUER}/api/v1/documents/${aliceDoc.id}`, { headers: auth(alice) })).json()) as CloudDoc
    expect(mine.currentVersion).toBe(1)
    await bobClient.close()

    const reg = await t.app.request(`${ISSUER}/oauth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: 'Reader', redirect_uris: ['https://claude.ai/cb'] }) })
    const { client_id } = (await reg.json()) as { client_id: string }
    const reader = await signIn(t, { sub: 'google:1', email: 'alice@example.com', name: 'Alice' }, { clientId: client_id, redirectUri: 'https://claude.ai/cb', scope: 'documents:read' })
    const readerClient = await connect(reader)
    expect(textOf(await readerClient.callTool({ name: 'get_document', arguments: { id: aliceDoc.id } }))).toContain('Hello from the test')
    const denied = await readerClient.callTool({ name: 'replace_text', arguments: { id: aliceDoc.id, find: 'Hello', replace: 'Hi' } })
    expect(denied.isError).toBe(true)
    expect(textOf(denied)).toContain('only read')
    await readerClient.close()
  })
})
