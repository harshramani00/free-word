import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let logPath: string | null = null

/** Append a line to <userData>/quill.log. Used for startup diagnostics and uncaught errors; never leaves the machine. */
export function log(...parts: unknown[]): void {
  try {
    if (!logPath) {
      const dir = app.getPath('userData')
      mkdirSync(dir, { recursive: true })
      logPath = join(dir, 'quill.log')
    }
    const line = `${new Date().toISOString()} ${parts.map((p) => (p instanceof Error ? (p.stack ?? p.message) : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`
    appendFileSync(logPath, line)
  } catch {
    /* logging must never throw */
  }
}

export function installErrorLogging(): void {
  process.on('uncaughtException', (err) => {
    log('uncaughtException', err)
    console.error(err)
  })
  process.on('unhandledRejection', (reason) => {
    log('unhandledRejection', reason instanceof Error ? reason : String(reason))
    console.error(reason)
  })
}
