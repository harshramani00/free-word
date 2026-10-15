import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * Version blobs on disk: data/users/<userId>/<docId>/v<N>.docx. Written to a
 * temporary name and renamed, so a file either exists complete or not at all.
 * A blob is never modified once written.
 */
export class BlobStore {
  constructor(readonly root: string) {}

  private dir(userId: string, docId: string): string {
    return join(this.root, 'users', userId, docId)
  }

  path(userId: string, docId: string, n: number): string {
    return join(this.dir(userId, docId), `v${n}.docx`)
  }

  async write(userId: string, docId: string, n: number, bytes: Uint8Array): Promise<{ size: number; sha256: string }> {
    const dir = this.dir(userId, docId)
    await fs.mkdir(dir, { recursive: true })
    const final = this.path(userId, docId, n)
    const tmp = `${final}.${process.pid}.${Date.now()}.tmp`
    await fs.writeFile(tmp, bytes)
    await fs.rename(tmp, final)
    return { size: bytes.byteLength, sha256: sha256(bytes) }
  }

  async read(userId: string, docId: string, n: number): Promise<Buffer> {
    return fs.readFile(this.path(userId, docId, n))
  }

  async remove(userId: string, docId: string, n: number): Promise<void> {
    await fs.rm(this.path(userId, docId, n), { force: true })
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
