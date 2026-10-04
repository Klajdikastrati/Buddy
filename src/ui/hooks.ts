import type { Session } from '@supabase/supabase-js'
import { useLiveQuery } from './live'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { localDateOf } from '../core/dates'
import type { Settings } from '../core/types'
import { db, DEFAULT_SETTINGS } from '../data/db'
import { supabase } from '../data/supabase'
import { syncStore, type SyncState } from '../data/sync'

/** undefined while reading local storage (instant), then Session | null. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  return session
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get)
}

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.meta.get('settings'), [])
  return { ...DEFAULT_SETTINGS, ...(row?.value as Partial<Settings> | undefined) }
}

/** The current local day; re-checks every minute and when the app resumes. */
export function useToday(settings: Settings): string {
  const compute = useCallback(
    () => localDateOf(new Date(), settings.timezone, settings.rolloverHour),
    [settings.timezone, settings.rolloverHour],
  )
  const [today, setToday] = useState(compute)
  useEffect(() => {
    const tick = () => setToday(compute())
    tick()
    const id = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [compute])
  return today
}

/* Minimal pathname router — four screens don't need a routing library. */

const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  window.addEventListener('popstate', fn)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('popstate', fn)
  }
}

export function navigate(path: string) {
  if (path === location.pathname) return
  history.pushState(null, '', path)
  listeners.forEach((fn) => fn())
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => location.pathname)
}

/**
 * The on-screen keyboard. iOS reports it inconsistently (innerHeight is wrong in
 * iOS 26 Home Screen apps, and it may pan the page instead of resizing), so we
 * only trust the *visible* area: `--vvt` / `--vvh` are its top and height, and
 * `html.kb-open` is set while the keyboard is up. An open sheet then fills the
 * visible area exactly (status bar → keyboard), like a native sheet's large
 * detent; its top edge glides there (FLIP) instead of jumping.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let tallest = vv.height
    let last = { top: -1, h: -1, open: false }
    let frame = 0
    const apply = () => {
      frame = 0
      tallest = Math.max(tallest, vv.height)
      const open = vv.height < tallest - 150
      const top = Math.round(vv.offsetTop)
      const h = Math.round(vv.height)
      if (open === last.open && Math.abs(top - last.top) < 2 && Math.abs(h - last.h) < 2) return
      const panels = open !== last.open ? [...document.querySelectorAll<HTMLElement>('dialog[open] .sheet-panel')] : []
      const before = panels.map((p) => p.getBoundingClientRect().top)
      last = { top, h, open }
      root.style.setProperty('--vvt', `${top}px`)
      root.style.setProperty('--vvh', `${h}px`)
      root.classList.toggle('kb-open', open)
      panels.forEach((p, i) => {
        // A sheet still sliding in lands in the new place by itself.
        if (p.getAnimations().some((a) => a.playState === 'running')) return
        const dy = before[i] - p.getBoundingClientRect().top
        if (Math.abs(dy) < 2) return
        p.animate([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], {
          duration: 300,
          easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        })
      })
    }
    const update = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    // A new orientation has a new full height.
    const reset = () => {
      tallest = 0
      update()
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    screen.orientation?.addEventListener('change', reset)
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      screen.orientation?.removeEventListener('change', reset)
    }
  }, [])
}
