import { useRef, useSyncExternalStore } from 'react'
import type { CloudRow, CloudState } from '../../shared/cloud'

/** Mirror of the main process's sync engine state, pushed over IPC. */
export interface CloudUi {
  state: CloudState
  rows: CloudRow[]
  loaded: boolean
}

let ui: CloudUi = {
  state: { enabled: false, account: null, online: false, lastSyncAt: null, pendingUploads: 0, connectorUrl: null },
  rows: [],
  loaded: false
}

const listeners = new Set<() => void>()
const emit = (): void => {
  for (const l of listeners) l()
}

export function getCloud(): CloudUi {
  return ui
}

function patch(p: Partial<CloudUi>): void {
  ui = { ...ui, ...p }
  emit()
}

let started = false
/** Subscribes to the main process once and loads the initial snapshot. */
export function startCloudStore(): void {
  if (started) return
  started = true
  window.quill.onCloudState((state) => patch({ state }))
  window.quill.onCloudList((rows) => patch({ rows }))
  void Promise.all([window.quill.cloudState(), window.quill.cloudList()]).then(([state, rows]) => patch({ state, rows, loaded: true }))
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function useCloud<T>(selector: (u: CloudUi) => T): T {
  const cache = useRef<{ input: CloudUi; output: T } | null>(null)
  const getSnapshot = (): T => {
    const next = selector(ui)
    if (cache.current && (cache.current.input === ui || shallowEqual(cache.current.output, next))) {
      cache.current = { input: ui, output: cache.current.output }
      return cache.current.output
    }
    cache.current = { input: ui, output: next }
    return next
  }
  const subscribe = (l: () => void): (() => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** The row for a synced document, if the library knows it. */
export function rowFor(docId: string | null): CloudRow | null {
  if (!docId) return null
  return ui.rows.find((r) => r.id === docId) ?? null
}

export function statusLabel(row: CloudRow): string {
  switch (row.status) {
    case 'cloud-only':
      return 'Not on this Mac'
    case 'synced':
      return 'Up to date'
    case 'newer-on-cloud':
      return 'Newer version on cloud'
    case 'pending-upload':
      return 'Waiting to upload'
    case 'local-only':
      return 'On this Mac only'
  }
}

export function isNewFromClaude(row: CloudRow): boolean {
  return row.updatedBy === 'claude' && row.currentVersion === 1 && row.status === 'cloud-only'
}

/** "just now", "5 min ago", "1 hr ago", "yesterday", or a date. */
export function relativeTime(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms)
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const day = Math.round(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
