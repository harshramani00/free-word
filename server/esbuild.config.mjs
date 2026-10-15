// Bundles the server into one ESM file so the Windows box needs nothing but Node.
// Every runtime dependency is pure JavaScript (docx, mammoth, jszip, xmldom, tiptap,
// happy-dom, hono, jose, the MCP SDK); SQLite comes from node:sqlite.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  // CommonJS dependencies (mammoth, jszip) reach for require(); give them one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
  }
})
