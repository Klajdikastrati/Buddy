import { useEffect, useRef, useSyncExternalStore } from 'react'

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

/** Confirmation pill. Disappears after 4 s, or swipe it down / sideways to dismiss. */
export function Toaster() {
  const t = useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )
  const el = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!t) return
    const timer = setTimeout(() => current?.id === t.id && set(null), 4000)
    return () => clearTimeout(timer)
  }, [t])

  const fling = (dx: number, dy: number) => {
    const node = el.current
    const id = t?.id
    if (!node) return set(null)
    node.style.transition = 'transform 180ms ease-in, opacity 180ms ease-in'
    node.style.transform = Math.abs(dx) > dy ? `translate3d(${dx > 0 ? 120 : -120}%, 0, 0)` : 'translate3d(0, 160%, 0)'
    node.style.opacity = '0'
    setTimeout(() => current?.id === id && set(null), 180)
  }

  return (
    <div className="toast-region" aria-live="polite">
      {t && (
        <div
          ref={el}
          className="toast"
          key={t.id}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return
            drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, dy: 0 }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            const d = drag.current
            const node = el.current
            if (!d || !node || e.pointerId !== d.id) return
            d.dx = e.clientX - d.x0
            d.dy = Math.max(0, e.clientY - d.y0) // only downwards
            const sideways = Math.abs(d.dx) > d.dy
            node.style.transition = 'none'
            node.style.transform = sideways ? `translate3d(${d.dx}px, 0, 0)` : `translate3d(0, ${d.dy}px, 0)`
            node.style.opacity = String(1 - Math.min(0.7, (sideways ? Math.abs(d.dx) : d.dy) / 160))
          }}
          onPointerUp={(e) => {
            const d = drag.current
            const node = el.current
            drag.current = null
            if (!d || !node || e.pointerId !== d.id) return
            const dist = Math.max(Math.abs(d.dx), d.dy)
            const v = dist / Math.max(1, performance.now() - d.t0)
            if (dist > 40 || v > 0.5) fling(d.dx, d.dy)
            else {
              node.style.transition = 'transform 200ms ease, opacity 200ms ease'
              node.style.transform = ''
              node.style.opacity = ''
            }
          }}
          onPointerCancel={() => {
            drag.current = null
            if (el.current) {
              el.current.style.transform = ''
              el.current.style.opacity = ''
            }
          }}
        >
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
