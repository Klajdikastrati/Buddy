import { useEffect, useSyncExternalStore } from 'react'

interface Toast {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

let current: Toast | null = null
let seq = 0
const listeners = new Set<() => void>()
const set = (t: Toast | null) => {
  current = t
  listeners.forEach((fn) => fn())
}

export function toast(text: string, action?: Toast['action']) {
  set({ id: ++seq, text, action })
}

export function Toaster() {
  const t = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )

  useEffect(() => {
    if (!t) return
    const timer = setTimeout(() => current?.id === t.id && set(null), 4000)
    return () => clearTimeout(timer)
  }, [t])

  return (
    <div className="toast-region" aria-live="polite">
      {t && (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="btn-text accent"
              onClick={() => {
                t.action?.run()
                set(null)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
