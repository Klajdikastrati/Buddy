import { useLayoutEffect, useMemo, useRef } from 'react'
import { Icon, type IconName } from './icons'

export interface Tab {
  path: string
  label: string
  icon: IconName
}

/** Moves the bubble: `pos` is a (fractional) tab index; `live` = following a finger. */
export type BubbleFn = (pos: number, live: boolean) => void

/**
 * Floating glass tab bar (iOS 26 style). A glass bubble sits behind the current
 * tab and glides — stretching a little — to the next one. Drag along the bar and
 * the bubble follows the finger (swelling like a lens); let go to switch there.
 * The + stays dead centre between the two groups.
 */
export function TabBar({
  left,
  right,
  current,
  onTab,
  onAdd,
  bind,
}: {
  left: Tab[]
  right: Tab[]
  current: number
  onTab: (index: number) => void
  onAdd: () => void
  /** Receives the bubble mover so the pager can drive it frame by frame. */
  bind: (fn: BubbleFn) => void
}) {
  const nav = useRef<HTMLElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const tabs = useRef<(HTMLAnchorElement | null)[]>([])
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const move = useRef<BubbleFn | null>(null)
  const scrub = useRef<{ id: number; x0: number; pos: number; active: boolean } | null>(null)
  const all = [...left, ...right]
  // Stable ref setters: a new callback per render would make React detach the tab
  // (null) and reattach it — mid-commit, while the pager may be asking for positions.
  const setTab = useMemo(
    () =>
      all.map((_, i) => (el: HTMLAnchorElement | null) => {
        if (el) tabs.current[i] = el
      }),
    [all.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  useLayoutEffect(() => {
    const moveBubble: BubbleFn = (pos, live) => {
      const b = bubble.current
      const els = tabs.current
      if (!b || !els.length || !nav.current) return
      const base = nav.current.getBoundingClientRect().left
      const box = (i: number) => {
        const r = els[Math.max(0, Math.min(els.length - 1, i))]?.getBoundingClientRect()
        return r ? { c: r.left - base + r.width / 2, w: r.width } : null
      }
      const i = Math.floor(pos)
      const f = pos - i
      const a = box(i)
      const z = box(i + 1) ?? a
      if (!a || !z) return
      const c = a.c + (z.c - a.c) * f
      const w = a.w + (z.w - a.w) * f
      clearTimeout(settle.current)
      b.style.width = `${w}px`
      if (live) {
        b.style.transition = 'transform 90ms linear'
        b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1.18, 1.12)`
      } else {
        // Glide: stretch along the way and overshoot a touch, then settle round.
        b.style.transition = 'transform 380ms cubic-bezier(0.3, 1.35, 0.5, 1)'
        b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1.14, 0.96)`
        settle.current = setTimeout(() => {
          b.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)'
          b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1)`
        }, 200)
      }
    }
    move.current = moveBubble
    bind(moveBubble)
    // First placement without animation.
    const b = bubble.current
    moveBubble(current, true)
    if (b) {
      b.style.transition = 'none'
      b.style.transform = b.style.transform.replace('scale(1.18, 1.12)', 'scale(1)')
    }
    const onResize = () => moveBubble(current, false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Fractional tab index under a finger at clientX (between tab centres). */
  const posAt = (x: number) => {
    const cs = tabs.current.map((el) => {
      const r = el!.getBoundingClientRect()
      return r.left + r.width / 2
    })
    if (x <= cs[0]) return 0
    for (let i = 0; i < cs.length - 1; i++) if (x <= cs[i + 1]) return i + (x - cs[i]) / (cs[i + 1] - cs[i])
    return cs.length - 1
  }

  const tab = (t: Tab) => {
    const i = all.indexOf(t)
    const on = i === current
    return (
      <a
        key={t.path}
        ref={setTab[i]}
        href={t.path}
        className="tab"
        aria-current={on ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault()
          onTab(i)
        }}
      >
        <Icon name={t.icon} size={23} strokeWidth={on ? 2.2 : 1.8} />
        <span>{t.label}</span>
      </a>
    )
  }

  return (
    <nav
      ref={nav}
      className="tabbar"
      aria-label="Main"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.tab-add')) return
        scrub.current = { id: e.pointerId, x0: e.clientX, pos: current, active: false }
      }}
      onPointerMove={(e) => {
        const s = scrub.current
        if (!s || s.id !== e.pointerId) return
        if (!s.active) {
          if (Math.abs(e.clientX - s.x0) < 8) return
          s.active = true
          e.currentTarget.setPointerCapture(e.pointerId)
        }
        s.pos = posAt(e.clientX)
        move.current?.(s.pos, true)
      }}
      onPointerUp={(e) => {
        const s = scrub.current
        scrub.current = null
        if (!s?.active || s.id !== e.pointerId) return
        // Swallow the click the release would send to the tab under the finger.
        const stop = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        window.addEventListener('click', stop, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 300)
        const i = Math.round(s.pos)
        if (i === current) move.current?.(current, false)
        else onTab(i)
      }}
      onPointerCancel={() => {
        if (scrub.current?.active) move.current?.(current, false)
        scrub.current = null
      }}
    >
      <span ref={bubble} className="tab-bubble" aria-hidden="true" />
      <div className="tab-group">{left.map(tab)}</div>
      <button type="button" className="tab tab-add" aria-label="Quick add" onClick={onAdd}>
        <span className="add-disc">
          <Icon name="plus" size={24} strokeWidth={2.4} />
        </span>
      </button>
      <div className="tab-group">{right.map(tab)}</div>
    </nav>
  )
}
