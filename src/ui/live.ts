import { liveQuery, type Subscription } from 'dexie'
import { createContext, useContext, useEffect, useRef, useState } from 'react'

/**
 * Per-page switch for live data. A paused page (off screen, or under a pushed
 * screen) keeps showing its last data but stops reacting to writes, so a save
 * only re-renders what's visible. Toggling it never re-renders anything —
 * subscriptions just stop and restart.
 */
export class PageGate {
  paused = false
  private listeners = new Set<() => void>()
  set(paused: boolean) {
    if (paused === this.paused) return
    this.paused = paused
    this.listeners.forEach((fn) => fn())
  }
  listen(fn: () => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
}

export const PageGateContext = createContext<PageGate | null>(null)

/**
 * Dexie live query, gate-aware. Returns undefined until the first result and
 * keeps the previous result while a new one loads (no blank frames). A paused
 * page still loads once, so it's never blank the first time it's seen.
 */
export function useLiveQuery<T>(querier: () => Promise<T> | T, deps: unknown[]): T | undefined {
  const gate = useContext(PageGateContext)
  const [value, setValue] = useState<T | undefined>(undefined)
  const loaded = useRef(false)

  useEffect(() => {
    let sub: Subscription | null = null
    const stop = () => {
      sub?.unsubscribe()
      sub = null
    }
    const start = () => {
      if (sub) return
      sub = liveQuery(querier).subscribe({
        next: (v) => {
          loaded.current = true
          setValue(() => v)
          if (gate?.paused) stop()
        },
        error: (e) => console.error('live query failed', e),
      })
    }
    const sync = () => (gate?.paused && loaded.current ? stop() : start())
    sync()
    const unlisten = gate?.listen(sync)
    return () => {
      unlisten?.()
      stop()
    }
    // The querier is re-created every render; `deps` says when it actually changes.
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  return value
}
