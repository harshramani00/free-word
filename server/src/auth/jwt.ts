import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify } from 'jose'
import type { JWK, KeyObject } from 'jose'

export interface AccessClaims {
  /** user id */
  sub: string
  /** grant id */
  gid: string
  /** client id */
  cid: string
  scope: string
}

export const ACCESS_TOKEN_TTL_SEC = 60 * 60

/**
 * Signs and verifies the server's own access tokens with an Ed25519 key that is
 * generated on first boot and kept in the data directory.
 */
export class TokenSigner {
  private constructor(
    private readonly privateKey: KeyObject | Uint8Array | CryptoKey,
    private readonly publicKey: KeyObject | Uint8Array | CryptoKey,
    readonly kid: string,
    private readonly issuer: string
  ) {}

  static async load(dataDir: string | null, issuer: string): Promise<TokenSigner> {
    let jwk: JWK | null = null
    const file = dataDir ? join(dataDir, 'keys', 'jwt.jwk') : null
    if (file) {
      try {
        jwk = JSON.parse(await fs.readFile(file, 'utf8')) as JWK
      } catch {
        jwk = null
      }
    }
    if (!jwk) {
      const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
      jwk = { ...(await exportJWK(pair.privateKey)), kid: crypto.randomUUID(), alg: 'EdDSA', use: 'sig' }
      if (file) {
        await fs.mkdir(dirname(file), { recursive: true })
        await fs.writeFile(file, JSON.stringify(jwk), { mode: 0o600 })
      }
    }
    const privateKey = await importJWK(jwk, 'EdDSA')
    const { d: _d, ...pub } = jwk
    const publicKey = await importJWK(pub, 'EdDSA')
    return new TokenSigner(privateKey, publicKey, jwk.kid ?? 'quill', issuer)
  }

  async sign(claims: AccessClaims, now = Date.now(), ttlSec = ACCESS_TOKEN_TTL_SEC): Promise<string> {
    const iat = Math.floor(now / 1000)
    return new SignJWT({ gid: claims.gid, cid: claims.cid, scope: claims.scope })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid, typ: 'at+jwt' })
      .setIssuer(this.issuer)
      .setAudience(this.issuer)
      .setSubject(claims.sub)
      .setJti(crypto.randomUUID())
      .setIssuedAt(iat)
      .setExpirationTime(iat + ttlSec)
      .sign(this.privateKey)
  }

  async verify(token: string, now = Date.now()): Promise<AccessClaims & { jti: string; exp: number }> {
    const { payload } = await jwtVerify(token, this.publicKey, { issuer: this.issuer, audience: this.issuer, algorithms: ['EdDSA'], currentDate: new Date(now) })
    if (typeof payload.sub !== 'string' || typeof payload.gid !== 'string' || typeof payload.cid !== 'string' || typeof payload.scope !== 'string') throw new Error('malformed token')
    return { sub: payload.sub, gid: payload.gid, cid: payload.cid, scope: payload.scope, jti: payload.jti ?? '', exp: payload.exp ?? 0 }
  }
}
