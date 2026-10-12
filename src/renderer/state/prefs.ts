/** Per-user UI preferences. Local only (no sync, no telemetry). */

export type ToolbarMode = 'simple' | 'full'

export interface Prefs {
  toolbarMode: ToolbarMode
  navVisible: boolean
  rulerVisible: boolean
  zoom: number
  startView: 'list' | 'grid'
}

const KEY = 'quill.prefs.v1'

const DEFAULTS: Prefs = { toolbarMode: 'full', navVisible: true, rulerVisible: true, zoom: 100, startView: 'list' }

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* storage unavailable: preferences simply do not persist */
  }
}
