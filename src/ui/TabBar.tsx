import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Icon, type IconName } from './icons'

export interface Tab {
  path: string
  label: string
  icon: IconName
}

/** Moves the bubble to a tab index; `live` = following a finger. */
export type BubbleFn = (pos: number, live: boolean) => void

/*
 * Springs, per frame (rAF), on transform only — never CSS transitions, which
 * restart on every pointer move and shake. Values from feel-testing:
 * following a finger is stiff and critically damped (tracks without lag or
 * wobble); settling onto a tab is softer with a little overshoot.
 */
const FOLLOW = { k: 1400, c: 75 }
const SETTLE = { k: 520, c: 34 }
const SCALE = { k: 700, c: 42 }
const LIFT = 1.28 // lens size while pressed

/**
 * Floating glass tab bar, modelled on the iOS 26 (Liquid Glass) tab bar:
 * - tap: the bubble glides to the tab (stretching with its speed) and settles;
 * - press and slide (one motion, no hold): the bubble lifts into a larger glass
 *   lens that follows the finger sideways only; the icon under it swells; release
 *   selects the tab under the finger and the lens shrinks back into the pill.
 * The + stays dead centre between the two groups and isn't part of the slide.
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
  /** Receives the bubble mover so the shell can settle it after navigation. */
  bind: (fn: BubbleFn) => void
}) {
  const nav = useRef<HTMLElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const tabs = useRef<(HTMLAnchorElement | null)[]>([])
  const press = useRef<{ id: number; x0: number; x: number; moved: boolean } | null>(null)
  const currentRef = useRef(current)
  currentRef.current = current
  /** Layout, measured once (mount, resize, press) — never during a drag. */
  const geo = useRef({ centres: [] as number[], width: 0 })
  /** Spring state: x = bubble centre (px in the bar), s = scale. */
  const sp = useRef({ x: 0, v: 0, tx: 0, s: 1, vs: 0, ts: 1, follow: false, raf: 0, last: 0 })
  const all = [...left, ...right]
  // Stable ref setters: a new callback per render would detach/reattach the tab mid-commit.
  const setTab = useMemo(
    () =>
      all.map((_, i) => (el: HTMLAnchorElement | null) => {
        if (el) tabs.current[i] = el
      }),
    [all.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** Layout positions (offset*, so the bar's own shrink transform doesn't skew them). */
  const measure = () => {
    if (!nav.current || tabs.current.some((t) => !t)) return
    const els = tabs.current as HTMLAnchorElement[]
    geo.current = { centres: els.map((el) => el.offsetLeft + el.offsetWidth / 2), width: els[0].offsetWidth }
    if (bubble.current) bubble.current.style.width = `${geo.current.width}px`
  }

  /** Finger x on screen → x in the bar's own (unscaled) layout. */
  const localX = (clientX: number) => {
    const n = nav.current!
    const r = n.getBoundingClientRect()
    return (clientX - r.left) * (n.offsetWidth / r.width)
  }

  // Slim the bar while scrolling down a page; bring it back on the way up or at the top.
  useEffect(() => {
    const n = nav.current
    if (!n) return
    const last = new WeakMap<Element, number>()
    const onScroll = (e: Event) => {
      const el = e.target
      if (!(el instanceof HTMLElement) || el.closest('dialog, .tabbar')) return
      const top = el.scrollTop
      const prev = last.get(el) ?? top
      last.set(el, top)
      if (top < 24) n.classList.remove('compact')
      else if (top - prev > 4) n.classList.add('compact')
      else if (prev - top > 8) n.classList.remove('compact')
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])
  useEffect(() => nav.current?.classList.remove('compact'), [current])

  /** Paint the current spring state: one transform on the bubble, icon swell by distance. */
  const paint = () => {
    const s = sp.current
    const b = bubble.current
    const { centres, width } = geo.current
    if (!b || !centres.length) return
    // Liquid stretch: wider with speed while gliding (not while lifted).
    const stretch = s.follow ? 0 : Math.min(0.22, Math.abs(s.v) / 4000)
    b.style.transform = `translate3d(${s.x - width / 2}px, 0, 0) scale(${s.s + stretch}, ${s.s})`
    const gap = centres.length > 1 ? centres[1] - centres[0] : width
    tabs.current.forEach((el, i) => {
      const svg = el?.querySelector('svg')
      if (!svg) return
      const k = s.s > 1.02 ? Math.max(0, 1 - Math.abs(s.x - centres[i]) / gap) * ((s.s - 1) / (LIFT - 1)) : 0
      svg.style.transform = k > 0.01 ? `scale(${1 + 0.2 * k})` : ''
    })
  }

  const step = (now: number) => {
    const s = sp.current
    const dt = Math.min(1 / 30, (now - (s.last || now)) / 1000) || 1 / 60
    s.last = now
    const p = s.follow ? FOLLOW : SETTLE
    // Fixed small sub-steps keep the stiff springs stable even when a frame is late.
    const n = Math.ceil(dt / (1 / 480))
    const h = dt / n
    for (let j = 0; j < n; j++) {
      s.v += (p.k * (s.tx - s.x) - p.c * s.v) * h
      s.x += s.v * h
      s.vs += (SCALE.k * (s.ts - s.s) - SCALE.c * s.vs) * h
      s.s += s.vs * h
    }
    paint()
    const resting = !s.follow && Math.abs(s.tx - s.x) < 0.3 && Math.abs(s.v) < 5 && Math.abs(s.ts - s.s) < 0.002 && Math.abs(s.vs) < 0.01
    if (resting) {
      s.x = s.tx
      s.s = s.ts
      s.v = s.vs = 0
      paint()
      s.raf = 0
      s.last = 0
    } else s.raf = requestAnimationFrame(step)
  }
  const kick = () => {
    if (!sp.current.raf) sp.current.raf = requestAnimationFrame(step)
  }

  useLayoutEffect(() => {
    const move: BubbleFn = (pos, live) => {
      const { centres } = geo.current
      if (!centres.length) return
      const i = Math.max(0, Math.min(centres.length - 1, Math.round(pos)))
      const s = sp.current
      s.tx = centres[i]
      s.follow = live
      s.ts = live ? LIFT : 1
      bubble.current?.classList.toggle('lifted', live)
      kick()
    }
    bind(move)
    measure()
    // First placement: no animation.
    const s = sp.current
    s.x = s.tx = geo.current.centres[current] ?? 0
    paint()
    const onResize = () => {
      measure()
      s.x = s.tx = geo.current.centres[currentRef.current] ?? s.x
      paint()
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(s.raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Finger x → lens target, clamped to the outer tab centres (sideways only). */
  const follow = (clientX: number) => {
    const p = press.current!
    const { centres } = geo.current
    p.x = Math.max(centres[0], Math.min(centres[centres.length - 1], localX(clientX)))
    const s = sp.current
    s.tx = p.x
    kick()
  }

  /** Nearest tab to a bar-relative x. */
  const nearest = (x: number) => {
    const { centres } = geo.current
    let best = 0
    centres.forEach((c, i) => {
      if (Math.abs(c - x) < Math.abs(centres[best] - x)) best = i
    })
    return best
  }

  const release = (select: boolean) => {
    const p = press.current
    press.current = null
    if (!p) return
    const i = nearest(p.x)
    const target = select ? i : currentRef.current
    const s = sp.current
    s.follow = false
    s.ts = 1
    s.tx = geo.current.centres[target]
    bubble.current?.classList.remove('lifted')
    kick()
    // Same tab: scroll to top / close a pushed screen — but not after sliding away and back.
    if (select && (i !== currentRef.current || !p.moved)) onTab(i)
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
          // Pointer presses are handled on release; this is keyboard / assistive activation.
          if (e.detail === 0) onTab(i)
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
        // Touching a slimmed bar brings it back to full size.
        nav.current?.classList.remove('compact')
        if (!(e.target as HTMLElement).closest('.tab:not(.tab-add)')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        measure()
        press.current = { id: e.pointerId, x0: e.clientX, x: 0, moved: false }
        // The lens lifts under the finger straight away.
        const s = sp.current
        s.follow = true
        s.ts = LIFT
        bubble.current?.classList.add('lifted')
        follow(e.clientX)
      }}
      onPointerMove={(e) => {
        const p = press.current
        if (!p || p.id !== e.pointerId) return
        if (Math.abs(e.clientX - p.x0) > 6) p.moved = true
        follow(e.clientX) // vertical movement is ignored
      }}
      onPointerUp={(e) => {
        if (press.current?.id === e.pointerId) release(true)
      }}
      onPointerCancel={() => release(false)}
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
