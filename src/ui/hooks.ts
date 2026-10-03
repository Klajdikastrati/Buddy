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
 * iOS keeps `position: fixed; bottom: 0` behind the on-screen keyboard. Expose
 * the covered height as `--kb` so sheets can sit above it.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      document.documentElement.style.setProperty('--kb', `${inset}px`)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
}
