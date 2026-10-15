import type { Hono } from 'hono'
import type { Config } from './config'
import type { Repo } from './db/repo'
import type { BlobStore } from './blobs'
import type { ChangeBus } from './events'
import type { TokenSigner } from './auth/jwt'
import type { IdentityProvider } from './auth/identity'
import type { DocumentService } from './service/documents'

/** What a verified bearer token tells a route about the caller. */
export interface AuthContext {
  userId: string
  grantId: string
  clientId: string
  scopes: string[]
}

export type Env = { Variables: { auth: AuthContext } }
export type App = Hono<Env>

export interface AppDeps {
  config: Config
  repo: Repo
  blobs: BlobStore
  bus: ChangeBus
  signer: TokenSigner
  identity: IdentityProvider
  docs: DocumentService
  now: () => number
  log: (...parts: unknown[]) => void
}
