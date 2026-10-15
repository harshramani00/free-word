import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createApp } from './app'
import { DevIdentityProvider, GoogleIdentityProvider } from './auth/identity'
import { TokenSigner } from './auth/jwt'
import { BlobStore } from './blobs'
import { loadConfig } from './config'
import type { Config } from './config'
import { Repo } from './db/repo'
import { openDatabase } from './db/schema'
import { ChangeBus } from './events'
import { DocumentService } from './service/documents'
import type { AppDeps } from './types'

const log = (...parts: unknown[]): void => console.log(new Date().toISOString(), ...parts.map((p) => (p instanceof Error ? p.stack ?? p.message : p)))

export async function createDeps(config: Config): Promise<AppDeps> {
  await fs.mkdir(config.dataDir, { recursive: true })
  const db = openDatabase(join(config.dataDir, 'quill.sqlite'))
  const repo = new Repo(db)
  const blobs = new BlobStore(config.dataDir)
  const bus = new ChangeBus()
  const signer = await TokenSigner.load(config.dataDir, config.issuer)
  const identity = config.devLogin ? new DevIdentityProvider(config.issuer) : new GoogleIdentityProvider(config.google!)
  const docs = new DocumentService(repo, blobs, bus, { keepVersions: config.keepVersions, quotaBytes: config.quotaBytes })
  return { config, repo, blobs, bus, signer, identity, docs, now: Date.now, log }
}

async function main(argv: string[]): Promise<void> {
  const command = argv[0] ?? 'serve'
  if (command === 'serve') {
    const config = loadConfig()
    const deps = await createDeps(config)
    const app = createApp(deps)
    serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
      log(`Quill Cloud listening on http://${info.address}:${info.port} (issuer ${config.issuer}, data ${config.dataDir}, login ${config.devLogin ? 'local dev form' : 'Google'})`)
    })
    return
  }
  if (command === 'backup') {
    const dest = argv[1]
    if (!dest) throw new Error('usage: backup <destination.sqlite>')
    const config = loadConfig()
    const db = openDatabase(join(config.dataDir, 'quill.sqlite'))
    const target = resolve(dest).replace(/'/g, "''")
    db.exec(`VACUUM INTO '${target}'`)
    db.close()
    log(`database copied to ${dest} (blobs live under ${join(config.dataDir, 'users')}; mirror that folder too)`)
    return
  }
  if (command === 'keygen') {
    const config = loadConfig()
    const signer = await TokenSigner.load(config.dataDir, config.issuer)
    log(`signing key ready (kid ${signer.kid}) in ${join(config.dataDir, 'keys')}`)
    return
  }
  throw new Error(`unknown command: ${command}`)
}

main(process.argv.slice(2)).catch((err) => {
  log(err)
  process.exit(1)
})
