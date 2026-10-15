import { resolve } from 'node:path'

export interface GoogleConfig {
  clientId: string
  clientSecret: string
}

export interface Config {
  /** Public origin, e.g. https://quill.harsh.ts.net. Also the OAuth issuer. */
  issuer: string
  host: string
  port: number
  dataDir: string
  google: GoogleConfig | null
  /** When true (loopback issuer only) a local form replaces Google so the stack can be tried without a Google client. */
  devLogin: boolean
  /** Lower-cased emails allowed to sign up; empty = anyone with a Google account. */
  allowedEmails: string[]
  quotaBytes: number
  keepVersions: number
  maxUploadBytes: number
}

function flag(v: string | undefined): boolean {
  return v !== undefined && ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]'
  } catch {
    return false
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8787)
  const issuer = (env.ISSUER ?? `http://127.0.0.1:${port}`).replace(/\/+$/, '')
  const google = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : null
  const devLogin = flag(env.QUILL_DEV_LOGIN)
  if (devLogin && !isLoopbackOrigin(issuer)) throw new Error('QUILL_DEV_LOGIN is only allowed when ISSUER is a loopback address')
  if (!google && !devLogin) throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or QUILL_DEV_LOGIN=1 for a local trial)')
  return {
    issuer,
    host: env.HOST ?? '127.0.0.1',
    port,
    dataDir: resolve(env.DATA_DIR ?? './data'),
    google,
    devLogin,
    allowedEmails: (env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    quotaBytes: Number(env.QUOTA_BYTES ?? 5 * 1024 ** 3),
    keepVersions: Number(env.KEEP_VERSIONS ?? 30),
    maxUploadBytes: Number(env.MAX_UPLOAD_BYTES ?? 50 * 1024 ** 2)
  }
}
