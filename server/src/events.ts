import type { ChangeKind } from '../../src/shared/cloud'

export interface ChangeEvent {
  seq: number
  docId: string
  kind: ChangeKind
}

type Listener = (ev: ChangeEvent) => void

/** In-process fan-out of change events, one channel per user, for the SSE stream. */
export class ChangeBus {
  private listeners = new Map<string, Set<Listener>>()

  subscribe(userId: string, fn: Listener): () => void {
    let set = this.listeners.get(userId)
    if (!set) {
      set = new Set()
      this.listeners.set(userId, set)
    }
    set.add(fn)
    return () => {
      set!.delete(fn)
      if (set!.size === 0) this.listeners.delete(userId)
    }
  }

  publish(userId: string, ev: ChangeEvent): void {
    const set = this.listeners.get(userId)
    if (!set) return
    for (const fn of set) {
      try {
        fn(ev)
      } catch {
        /* a broken listener must not stop the others */
      }
    }
  }
}
