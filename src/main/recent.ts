import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import type { RecentEntry } from '../shared/types'

const MAX_RECENT = 20

interface StoredRecent {
  path: string
  lastOpened: number
}

function storePath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

async function readStore(): Promise<StoredRecent[]> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is StoredRecent => typeof e === 'object' && e !== null && typeof (e as StoredRecent).path === 'string'
    )
  } catch {
    return []
  }
}

async function writeStore(entries: StoredRecent[]): Promise<void> {
  await fs.mkdir(dirname(storePath()), { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(entries, null, 2), 'utf8')
}

/** "Documents › Garden Club" for a path under the home folder; otherwise the last two folders. */
export function breadcrumb(filePath: string): string {
  const dir = dirname(filePath)
  const home = homedir()
  let parts: string[]
  if (dir === home) return 'Home'
  if (dir.startsWith(home + sep)) {
    parts = relative(home, dir).split(sep)
  } else {
    parts = dir.split(sep).filter(Boolean).slice(-2)
  }
  return parts.filter(Boolean).join(' › ') || dir
}

async function toEntry(stored: StoredRecent): Promise<RecentEntry | null> {
  try {
    const stat = await fs.stat(stored.path)
    if (!stat.isFile()) return null
    return {
      path: stored.path,
      name: basename(stored.path, '.docx'),
      dir: breadcrumb(stored.path),
      lastOpened: stored.lastOpened,
      modified: stat.mtimeMs,
      size: stat.size
    }
  } catch {
    return null
  }
}

/** Entries whose files still exist, most recently opened first. Missing files are pruned from disk. */
export async function listRecent(): Promise<RecentEntry[]> {
  const stored = await readStore()
  const entries = await Promise.all(stored.map(toEntry))
  const alive = entries.filter((e): e is RecentEntry => e !== null)
  if (alive.length !== stored.length) {
    await writeStore(alive.map((e) => ({ path: e.path, lastOpened: e.lastOpened })))
  }
  return alive.sort((a, b) => b.lastOpened - a.lastOpened)
}

export async function addRecent(filePath: string): Promise<void> {
  const stored = (await readStore()).filter((e) => e.path !== filePath)
  stored.unshift({ path: filePath, lastOpened: Date.now() })
  await writeStore(stored.slice(0, MAX_RECENT))
  app.addRecentDocument(filePath)
}

export async function removeRecent(filePath: string): Promise<RecentEntry[]> {
  const stored = (await readStore()).filter((e) => e.path !== filePath)
  await writeStore(stored)
  return listRecent()
}
