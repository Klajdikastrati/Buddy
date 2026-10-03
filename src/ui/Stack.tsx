import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NAV_EASE, NAV_MS } from './Pager'

// Pushed screens (detail pages, Workout Mode) above the tab pager. A push
// slides in from the right (Workout Mode: from the bottom), a pop slides out
// the same way, and a drag from the left edge takes you back.

type Phase = 'enter' | 'shown' | 'leave' | 'under'

interface Layer {
  path: string
  key: number
  phase: Phase
}

export interface StackRoute {
  render: () => ReactNode
  /** Where "back" goes (edge swipe); null = no swipe back. */
  parent: string | null
  /** Full-screen modal from the bottom, above the tab bar. */
  modal?: boolean
}

export function StackLayer({ path, routes, onBack }: { path: string; routes: Record<string, StackRoute>; onBack: (to: string) => void }) {
  const [layers, setLayers] = useState<Layer[]>(() => (routes[path] ? [{ path, key: 0, phase: 'shown' }] : []))
  const seq = useRef(1)

  useLayoutEffect(() => {
    setLayers((cur) => {
      const top = cur.filter((l) => l.phase !== 'leave' && l.phase !== 'under').at(-1)
      if (!routes[path]) return cur.some((l) => l.phase !== 'leave') ? cur.map((l) => ({ ...l, phase: 'leave' })) : cur
      if (top?.path === path) return cur
      // Push: whatever was on top slides under, the new screen enters.
      return [...cur.map((l) => (l.phase === 'leave' ? l : { ...l, phase: 'under' as const })), { path, key: seq.current++, phase: 'enter' }]
    })
  }, [path, routes])

  const settle = (key: number) =>
    setLayers((cur) =>
      cur.flatMap((l) => {
        if (l.key !== key) return [l]
        if (l.phase === 'enter') return [{ ...l, phase: 'shown' as const }]
        return l.phase === 'leave' || l.phase === 'under' ? [] : [l]
      }),
    )

  return (
    <>
      {layers.map((l) => {
        const route = routes[l.path]
        if (!route) return null
        return (
          <StackPage key={l.key} phase={l.phase} modal={!!route.modal} onSettled={() => settle(l.key)} onBack={route.parent ? () => onBack(route.parent!) : undefined}>
            {route.render()}
          </StackPage>
        )
      })}
    </>
  )
}

const TRANSITION = `transform ${NAV_MS}ms ${NAV_EASE}`

function StackPage({
  phase,
  modal,
  onSettled,
  onBack,
  children,
}: {
  phase: Phase
  modal: boolean
  onSettled: () => void
  onBack?: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x0: number; y0: number; t0: number; dx: number; mode: 'pending' | 'horizontal' } | null>(null)
  const hidden = modal ? 'translate3d(0, 100%, 0)' : 'translate3d(100%, 0, 0)'

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (phase === 'enter') {
      el.style.transition = 'none'
      el.style.transform = hidden
      void el.offsetWidth // commit the start position before animating
      el.style.transition = TRANSITION
      el.style.transform = 'translate3d(0, 0, 0)'
    } else if (phase === 'leave') {
      el.style.transition = TRANSITION
      el.style.transform = hidden
    } else if (phase === 'under') {
      el.style.transition = TRANSITION
      el.style.transform = modal ? 'translate3d(0, 0, 0)' : 'translate3d(-25%, 0, 0)'
    }
    if (phase === 'shown') return
    // transitionend can be skipped (hidden tab, reduced motion); never leave a layer stuck.
    const t = setTimeout(onSettled, NAV_MS + 120)
    return () => clearTimeout(t)
  }, [phase])

  return (
    <div
      ref={ref}
      className={`stack-page ${modal ? 'modal' : ''}`}
      inert={phase === 'leave' || phase === 'under'}
      onTransitionEnd={(e) => {
        if (e.target === ref.current && e.propertyName === 'transform' && phase !== 'shown') onSettled()
      }}
      onPointerDown={(e) => {
        // Edge swipe back: a touch starting at the left edge.
        if (!onBack || phase !== 'shown' || e.pointerType === 'mouse' || e.clientX > 28) return
        drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, mode: 'pending' }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        const el = ref.current
        if (!d || !el || e.pointerId !== d.id) return
        const dx = e.clientX - d.x0
        const dy = e.clientY - d.y0
        if (d.mode === 'pending') {
          if (dx > 8 && dx > Math.abs(dy)) {
            d.mode = 'horizontal'
            e.currentTarget.setPointerCapture(e.pointerId)
          } else if (Math.abs(dy) > 10) {
            drag.current = null
            return
          } else return
        }
        d.dx = Math.max(0, dx)
        el.style.transition = 'none'
        el.style.transform = `translate3d(${d.dx}px, 0, 0)`
      }}
      onPointerUp={(e) => {
        const d = drag.current
        const el = ref.current
        drag.current = null
        if (!d || !el || d.mode !== 'horizontal' || e.pointerId !== d.id) return
        const velocity = d.dx / Math.max(1, performance.now() - d.t0)
        if (d.dx > el.clientWidth * 0.33 || velocity > 0.5) onBack?.()
        else {
          el.style.transition = TRANSITION
          el.style.transform = 'translate3d(0, 0, 0)'
        }
      }}
      onPointerCancel={() => {
        const el = ref.current
        if (drag.current?.mode === 'horizontal' && el) {
          el.style.transition = TRANSITION
          el.style.transform = 'translate3d(0, 0, 0)'
        }
        drag.current = null
      }}
    >
      {children}
    </div>
  )
}
