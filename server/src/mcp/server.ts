import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { requireBearer } from '../auth/middleware'
import type { AppDeps, Env } from '../types'
import { registerTools } from './tools'

export const MCP_SERVER_VERSION = '0.1.0'

/**
 * The MCP endpoint. Stateless Streamable HTTP: every request gets a fresh server bound
 * to the caller's account, so there is no session to hijack and nothing to clean up.
 */
export function mcpRoutes(deps: AppDeps): Hono<Env> {
  const app = new Hono<Env>()
  app.all('/mcp', requireBearer(deps), async (c) => {
    const auth = c.var.auth
    const grant = deps.repo.getGrant(auth.grantId)
    const server = new McpServer(
      { name: 'quill-cloud', version: MCP_SERVER_VERSION },
      { instructions: 'Quill holds the user’s documents as .docx files. Read with get_document (use format "outline" before precise edits), change with replace_text / insert_blocks / replace_section / replace_blocks, create with create_document. Every change becomes a new version; include a short note. Documents are identified by the ids from list_documents.' }
    )
    registerTools(server, deps, { userId: auth.userId, scopes: auth.scopes, clientName: grant?.client_name ?? 'app' })
    // Stateless and plain JSON responses: one request, one answer, nothing left open.
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    await server.connect(transport)
    return transport.handleRequest(c.req.raw)
  })
  return app
}
