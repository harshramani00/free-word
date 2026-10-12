import { useSyncExternalStore } from 'react'
import { DEFAULT_PAGE_SETUP } from '../../shared/pageSetup'
import type { CloseReason, JSONContent, PageSetup } from '../../shared/types'
import { loadPrefs, savePrefs } from './prefs'
import type { ToolbarMode } from './prefs'

export type RibbonTab = 'home' | 'insert' | 'layout' | 'references' | 'review' | 'view' | 'table'

/** What the user was trying to do when the unsaved-changes sheet interrupted them. */
export type PendingIntent =
  | { kind: 'new'; content: JSONContent | null }
  | { kind: 'open'; path?: string }
  | { kind: 'openDocument'; path: string; name: string; json: JSONContent; pageSetup: PageSetup }
  | { kind: 'close'; reason: CloseReason }
  | { kind: 'start' }

export type Sheet = { kind: 'export' } | { kind: 'unsaved'; intent: PendingIntent } | null

export interface DocState {
  screen: 'start' | 'editor'
  path: string | null
  name: string
  dirty: boolean
  pageSetup: PageSetup
  zoom: number
  toolbarMode: ToolbarMode
  activeTab: RibbonTab
  navVisible: boolean
  rulerVisible: boolean
  sheet: Sheet
  /** Content the editor should load; bumped `loadToken` tells the editor to apply it. */
  pendingContent: JSONContent | null
  loadToken: number
  pageCount: number
  currentPage: number
  words: number
  characters: number
  /** Last non-fatal import warnings, shown once in the status bar. */
  notice: string | null
}

export const ZOOM_MIN = 50
export const ZOOM_MAX = 200
export const ZOOM_STEP = 10

const prefs = loadPrefs()

let state: DocState = {
  screen: 'start',
  path: null,
  name: 'Untitled',
  dirty: false,
  pageSetup: DEFAULT_PAGE_SETUP,
  zoom: prefs.zoom,
  toolbarMode: prefs.toolbarMode,
  activeTab: 'home',
  navVisible: prefs.navVisible,
  rulerVisible: prefs.rulerVisible,
  sheet: null,
  pendingContent: null,
  loadToken: 0,
  pageCount: 1,
  currentPage: 1,
  words: 0,
  characters: 0,
  notice: null
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function getState(): DocState {
  return state
}

export function setState(patch: Partial<DocState> | ((prev: DocState) => Partial<DocState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  if ('toolbarMode' in next || 'navVisible' in next || 'rulerVisible' in next || 'zoom' in next) {
    savePrefs({ ...loadPrefs(), toolbarMode: state.toolbarMode, navVisible: state.navVisible, rulerVisible: state.rulerVisible, zoom: state.zoom })
  }
  emit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDocState<T>(selector: (s: DocState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state))
}

export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(z)))

/** Loads a document into the editor screen. */
export function loadDocument(json: JSONContent, meta: { path: string | null; name: string; pageSetup: PageSetup; notice?: string | null }): void {
  setState((prev) => ({
    screen: 'editor',
    path: meta.path,
    name: meta.name,
    dirty: false,
    pageSetup: meta.pageSetup,
    pendingContent: json,
    loadToken: prev.loadToken + 1,
    sheet: null,
    activeTab: 'home',
    notice: meta.notice ?? null
  }))
}

export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
