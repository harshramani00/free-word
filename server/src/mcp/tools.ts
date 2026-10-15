import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SCOPE_WRITE } from '../../../src/shared/cloud'
import type { CloudDoc } from '../../../src/shared/cloud'
import { DEFAULT_PAGE_SETUP } from '../../../src/shared/pageSetup'
import type { PageSetup } from '../../../src/shared/pageSetup'
import type { JSONContent } from '../../../src/shared/types'
import { EditError, insertBlocks, replaceBlocks, replaceSection, replaceText } from '../content/edit'
import { loadDocx, saveDocx, validateBlocks, withDocLock } from '../content/load'
import { docToMarkdown, markdownToBlocks, outline } from '../content/markdown'
import { HttpError } from '../service/documents'
import type { AppDeps } from '../types'

export interface ToolContext {
  userId: string
  scopes: string[]
  clientName: string
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const fail = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

function describe(d: CloudDoc): string {
  const where = d.path ? `${d.path}/` : ''
  return `${d.id}  ${where}${d.name}.docx  v${d.currentVersion}  ${d.updatedBy === 'claude' ? 'Claude' : 'user'} ${new Date(d.updatedAt).toISOString()}${d.note ? `  “${d.note}”` : ''}`
}

const blockSchema = z.record(z.string(), z.unknown())
const contentSchema = {
  markdown: z.string().optional().describe('Content as Markdown (headings, paragraphs, lists, tables, **bold**, *italic*, links). Use this or `blocks`.'),
  blocks: z.array(blockSchema).optional().describe('Content as Quill/TipTap JSON blocks (advanced). Use this or `markdown`.')
}

function toBlocks(input: { markdown?: string; blocks?: Record<string, unknown>[] }): JSONContent[] {
  const blocks = input.blocks ? (input.blocks as JSONContent[]) : input.markdown !== undefined ? markdownToBlocks(input.markdown) : null
  if (!blocks) throw new EditError('Provide `markdown` or `blocks`')
  if (!blocks.length) throw new EditError('The content is empty')
  validateBlocks(blocks)
  return blocks
}

/**
 * Registers Quill's tools on an McpServer bound to one signed-in user. Every
 * document the tools touch is looked up with that user's id; nothing else exists.
 */
export function registerTools(server: McpServer, deps: AppDeps, ctx: ToolContext): void {
  const { docs } = deps
  const canWrite = ctx.scopes.includes(SCOPE_WRITE)

  const guarded = <A>(write: boolean, fn: (args: A) => Promise<ToolResult>) => async (args: A): Promise<ToolResult> => {
    if (write && !canWrite) return fail('This connection can only read documents. Reconnect Quill with write access to make changes.')
    try {
      return await fn(args)
    } catch (err) {
      if (err instanceof EditError) return fail(err.message)
      if (err instanceof HttpError) return fail(err.status === 404 ? 'No such document. Call list_documents to see what exists.' : err.message)
      deps.log('mcp tool failed', err)
      return fail(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** Loads the newest version of a document for editing, with an optional staleness check. */
  const load = async (id: string, expectedVersion?: number): Promise<{ doc: CloudDoc; json: JSONContent; pageSetup: PageSetup; warnings: string[] }> => {
    const doc = docs.get(ctx.userId, id)
    if (expectedVersion !== undefined && expectedVersion !== doc.currentVersion) throw new EditError(`The document is now at version ${doc.currentVersion}, not ${expectedVersion}. Read it again before editing.`)
    const { bytes } = await docs.content(ctx.userId, id, doc.currentVersion)
    const loaded = await loadDocx(bytes)
    return { doc, ...loaded }
  }

  /** Writes an edited JSON as a new version by Claude. */
  const commit = async (doc: CloudDoc, json: JSONContent, pageSetup: PageSetup, note: string | undefined, summary: string, warnings: string[]): Promise<ToolResult> => {
    const bytes = await saveDocx(json, pageSetup)
    const saved = await docs.addVersion(ctx.userId, doc.id, { bytes, updatedBy: 'claude', note: note ?? summary, baseVersion: doc.currentVersion })
    const warn = warnings.length ? `\nNote: the file was not written by Quill originally; ${warnings.length} formatting detail(s) could not be kept.` : ''
    return ok(`${summary}\nSaved “${saved.name}” as version ${saved.currentVersion}.${warn}`)
  }

  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description: 'Lists the documents in the user’s Quill cloud: id, folder/name, current version, who last changed it and when. Deleted documents are hidden unless asked for.',
      inputSchema: { folder: z.string().optional().describe('Only documents in this folder (relative to the Quill folder)'), includeDeleted: z.boolean().optional() }
    },
    guarded<{ folder?: string; includeDeleted?: boolean }>(false, async ({ folder, includeDeleted }) => {
      let list = docs.list(ctx.userId, includeDeleted ?? false)
      if (folder !== undefined) list = list.filter((d) => d.path === folder.replace(/^\/+|\/+$/g, ''))
      if (!list.length) return ok('No documents yet.')
      return ok(`${list.length} document(s):\n${list.map(describe).join('\n')}`)
    })
  )

  server.registerTool(
    'get_document',
    {
      title: 'Read a document',
      description: 'Returns a document’s content. `markdown` (default) is readable text; `outline` lists top-level blocks with their indices for precise edits; `json` is the raw editor structure.',
      inputSchema: { id: z.string(), format: z.enum(['markdown', 'outline', 'json']).optional(), version: z.number().int().positive().optional().describe('A specific version; defaults to the newest') }
    },
    guarded<{ id: string; format?: 'markdown' | 'outline' | 'json'; version?: number }>(false, async ({ id, format, version }) => {
      const doc = docs.get(ctx.userId, id)
      const { bytes, version: v } = await docs.content(ctx.userId, id, version)
      const { json } = await loadDocx(bytes)
      const head = `${doc.name} (version ${v.n} of ${doc.currentVersion})\n\n`
      if (format === 'json') return ok(head + JSON.stringify(json))
      if (format === 'outline') return ok(head + outline(json))
      return ok(head + docToMarkdown(json))
    })
  )

  server.registerTool(
    'create_document',
    {
      title: 'Create a document',
      description: 'Creates a new .docx in the user’s cloud from Markdown (or JSON blocks). It appears under Cloud in Quill on their Mac; nothing is downloaded there until they choose to.',
      inputSchema: { name: z.string().min(1).describe('Document name without .docx'), folder: z.string().optional().describe('Folder inside the Quill folder, e.g. "Garden Club"'), ...contentSchema, note: z.string().optional().describe('One line on what this is, shown in version history') }
    },
    guarded<{ name: string; folder?: string; markdown?: string; blocks?: Record<string, unknown>[]; note?: string }>(true, async ({ name, folder, markdown, blocks, note }) => {
      const content = toBlocks({ markdown, blocks })
      const bytes = await saveDocx({ type: 'doc', content }, DEFAULT_PAGE_SETUP)
      const doc = await docs.create(ctx.userId, { name, path: folder ?? '', bytes, updatedBy: 'claude', note: note ?? 'Created by Claude' })
      return ok(`Created “${doc.name}” (id ${doc.id}) in ${doc.path ? `folder “${doc.path}”` : 'the Quill folder'} as version 1.`)
    })
  )

  server.registerTool(
    'replace_text',
    {
      title: 'Replace text',
      description: 'Finds text anywhere in the document and replaces it, keeping the surrounding formatting. Saves a new version.',
      inputSchema: { id: z.string(), find: z.string().min(1), replace: z.string(), all: z.boolean().optional().describe('Replace every match (default: first only)'), matchCase: z.boolean().optional(), expectedVersion: z.number().int().optional().describe('Fail if the document changed since you read this version'), note: z.string().optional() }
    },
    guarded<{ id: string; find: string; replace: string; all?: boolean; matchCase?: boolean; expectedVersion?: number; note?: string }>(true, async ({ id, find, replace, all, matchCase, expectedVersion, note }) =>
      withDocLock(id, async () => {
        const { doc, json, pageSetup, warnings } = await load(id, expectedVersion)
        const { doc: edited, count } = replaceText(json, find, replace, { all, matchCase })
        return commit(doc, edited, pageSetup, note, `Replaced ${count} occurrence(s) of “${find}”.`, warnings)
      })
    )
  )

  server.registerTool(
    'insert_blocks',
    {
      title: 'Insert content',
      description: 'Inserts Markdown (or JSON blocks) at a position: the start or end, after a heading (optionally at the end of that heading’s section), or before/after a block index from get_document(outline). Saves a new version.',
      inputSchema: {
        id: z.string(),
        ...contentSchema,
        at: z.union([z.object({ position: z.enum(['start', 'end']) }), z.object({ afterHeading: z.string(), endOfSection: z.boolean().optional() }), z.object({ afterBlockIndex: z.number().int() }), z.object({ beforeBlockIndex: z.number().int() })]),
        expectedVersion: z.number().int().optional(),
        note: z.string().optional()
      }
    },
    guarded<{ id: string; markdown?: string; blocks?: Record<string, unknown>[]; at: Parameters<typeof insertBlocks>[2]; expectedVersion?: number; note?: string }>(true, async ({ id, markdown, blocks, at, expectedVersion, note }) =>
      withDocLock(id, async () => {
        const content = toBlocks({ markdown, blocks })
        const { doc, json, pageSetup, warnings } = await load(id, expectedVersion)
        const edited = insertBlocks(json, content, at)
        return commit(doc, edited, pageSetup, note, `Inserted ${content.length} block(s).`, warnings)
      })
    )
  )

  server.registerTool(
    'replace_blocks',
    {
      title: 'Replace blocks',
      description: 'Replaces a range of top-level blocks (indices from get_document(outline)) with new content. Pass expectedText (the start of the first block) as a safety check. Saves a new version.',
      inputSchema: { id: z.string(), startIndex: z.number().int().min(0), endIndex: z.number().int().min(0), expectedText: z.string().optional(), ...contentSchema, expectedVersion: z.number().int().optional(), note: z.string().optional() }
    },
    guarded<{ id: string; startIndex: number; endIndex: number; expectedText?: string; markdown?: string; blocks?: Record<string, unknown>[]; expectedVersion?: number; note?: string }>(true, async ({ id, startIndex, endIndex, expectedText, markdown, blocks, expectedVersion, note }) =>
      withDocLock(id, async () => {
        const content = toBlocks({ markdown, blocks })
        const { doc, json, pageSetup, warnings } = await load(id, expectedVersion)
        const edited = replaceBlocks(json, startIndex, endIndex, content, expectedText)
        return commit(doc, edited, pageSetup, note, `Replaced blocks ${startIndex}–${endIndex} with ${content.length} block(s).`, warnings)
      })
    )
  )

  server.registerTool(
    'replace_section',
    {
      title: 'Replace a section',
      description: 'Replaces everything under a heading (up to the next heading of the same or higher level) with new content. The heading itself stays. Saves a new version.',
      inputSchema: { id: z.string(), heading: z.string(), ...contentSchema, expectedVersion: z.number().int().optional(), note: z.string().optional() }
    },
    guarded<{ id: string; heading: string; markdown?: string; blocks?: Record<string, unknown>[]; expectedVersion?: number; note?: string }>(true, async ({ id, heading, markdown, blocks, expectedVersion, note }) =>
      withDocLock(id, async () => {
        const content = toBlocks({ markdown, blocks })
        const { doc, json, pageSetup, warnings } = await load(id, expectedVersion)
        const edited = replaceSection(json, heading, content)
        return commit(doc, edited, pageSetup, note, `Rewrote the section “${heading}”.`, warnings)
      })
    )
  )

  server.registerTool(
    'list_versions',
    { title: 'List versions', description: 'Lists a document’s saved versions, newest first, with who made each and their note.', inputSchema: { id: z.string() } },
    guarded<{ id: string }>(false, async ({ id }) => {
      const list = docs.versions(ctx.userId, id)
      return ok(list.map((v) => `v${v.n}  ${v.updatedBy === 'claude' ? 'Claude' : 'user'}  ${new Date(v.createdAt).toISOString()}${v.note ? `  “${v.note}”` : ''}`).join('\n'))
    })
  )

  server.registerTool(
    'restore_version',
    { title: 'Restore a version', description: 'Makes an earlier version the newest one (as a new version, so nothing is lost).', inputSchema: { id: z.string(), version: z.number().int().positive(), note: z.string().optional() } },
    guarded<{ id: string; version: number; note?: string }>(true, async ({ id, version, note }) => {
      const doc = await docs.restoreVersion(ctx.userId, id, version, { updatedBy: 'claude', note: note ?? `Restored version ${version}` })
      return ok(`“${doc.name}” is now at version ${doc.currentVersion}, a copy of version ${version}.`)
    })
  )
}
