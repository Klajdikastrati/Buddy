import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { PageGate, PageGateContext } from './live'

// Instagram-style horizontal pager for the main tabs. Every page stays
// mounted (instant switch, scroll position kept); the track follows the
// finger and snaps by distance or flick speed. Taps animate by position.

export const NAV_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const NAV_MS = 340

interface Drag {
  id: number
  x0: number
  y0: number
  t0: number
  dx: number
  width: number
  mode: 'pending' | 'horizontal'
}

/** Swallow the click that a finished swipe would otherwise send to whatever is under the finger. */
function suppressNextClick() {
  const stop = (e: Event) => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 350)
}

export function Pager({
  index,
  onSwipe,
  covered,
  pages,
  onPosition,
}: {
  index: number
  onSwipe: (index: number) => void
  /** Fractional page position while dragging (live) or the target on settle — drives the tab bubble. */
  onPosition?: (pos: number, live: boolean) => void
  /** A pushed screen is on top: shift back and dim, ignore swipes. */
  covered: boolean
  pages: ReactNode[]
}) {
  const count = pages.length
  const track = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const first = useRef(true)
  const [gates] = useState(() => pages.map(() => new PageGate()))

  /** Only the visible page reacts to writes; neighbours wake while a swipe could reveal them. */
  const gateAll = (swiping: boolean) =>
    gates.forEach((g, i) => g.set(covered || (i !== index && !(swiping && Math.abs(i - index) === 1))))

  useLayoutEffect(() => gateAll(false), [index, covered]) // eslint-disable-line react-hooks/exhaustive-deps

  const prev = useRef(index)

  const place = (i: number, animate: boolean, offsetPx = 0) => {
    const el = track.current
    if (!el) return
    el.style.transition = animate ? `transform ${NAV_MS}ms ${NAV_EASE}` : 'none'
    el.style.transform = `translate3d(calc(${(-i * 100) / count}% + ${offsetPx}px), 0, 0)`
  }

  // Follow the active index; the first placement is instant. A jump of more than
  // one tab only travels one page width (from the neighbouring side) — sweeping
  // across every page in between is too much motion.
  useLayoutEffect(() => {
    const from = prev.current
    prev.current = index
    if (!first.current && Math.abs(index - from) > 1) {
      place(index + (index > from ? -1 : 1), false)
      void track.current?.offsetWidth
    }
    place(index, !first.current)
    onPosition?.(index, false)
    first.current = false
  }, [index])

  return (
    <div
      className={`pager ${covered ? 'covered' : ''}`}
      onPointerDown={(e) => {
        if (covered || e.pointerType === 'mouse') return
        if ((e.target as HTMLElement).closest('input, textarea, select, [data-no-swipe]')) return
        drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), dx: 0, width: e.currentTarget.clientWidth, mode: 'pending' }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || e.pointerId !== d.id) return
        const dx = e.clientX - d.x0
        const dy = e.clientY - d.y0
        if (d.mode === 'pending') {
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            d.mode = 'horizontal'
            e.currentTarget.setPointerCapture(e.pointerId)
            gateAll(true)
          } else if (Math.abs(dy) > 10) {
            drag.current = null // vertical: let the page scroll
            return
          } else return
        }
        // Rubber-band past the first and last page.
        const atEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0)
        d.dx = atEdge ? dx * 0.3 : dx
        place(index, false, d.dx)
        onPosition?.(Math.max(0, Math.min(count - 1, index - d.dx / d.width)), true)
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.mode !== 'horizontal' || e.pointerId !== d.id) return
        suppressNextClick()
        const velocity = d.dx / Math.max(1, performance.now() - d.t0) // px/ms
        let next = index
        if ((d.dx < -d.width * 0.22 || velocity < -0.45) && index < count - 1) next = index + 1
        else if ((d.dx > d.width * 0.22 || velocity > 0.45) && index > 0) next = index - 1
        if (next !== index) onSwipe(next)
        else {
          place(index, true)
          onPosition?.(index, false)
          gateAll(false)
        }
      }}
      onPointerCancel={() => {
        if (drag.current?.mode === 'horizontal') {
          place(index, true)
          onPosition?.(index, false)
          gateAll(false)
        }
        drag.current = null
      }}
    >
      <div ref={track} className="pager-track" style={{ '--pages': count } as React.CSSProperties}>
        {pages.map((page, i) => (
          <div key={i} className="page" data-page={i} inert={i !== index || covered} aria-hidden={i !== index}>
            <PageGateContext.Provider value={gates[i]}>{page}</PageGateContext.Provider>
          </div>
        ))}
      </div>
      <div className="pager-dim" aria-hidden="true" />
    </div>
  )
}

/** Scroll a tab's page back to the top (tapping the active tab). */
export function scrollPageTop(index: number) {
  document.querySelector<HTMLElement>(`.page[data-page="${index}"]`)?.scrollTo({ top: 0, behavior: 'smooth' })
}
