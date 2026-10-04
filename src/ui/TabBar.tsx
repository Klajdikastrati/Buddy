import { useLayoutEffect, useMemo, useRef } from 'react'
import { Icon, type IconName } from './icons'

export interface Tab {
  path: string
  label: string
  icon: IconName
}

/** Moves the bubble to a (fractional) tab index; `live` = following a finger. */
export type BubbleFn = (pos: number, live: boolean) => void

const SPRING = 'cubic-bezier(0.3, 1.35, 0.5, 1)'
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Floating glass tab bar, modelled on the iOS 26 (Liquid Glass) tab bar:
 * - tap: the bubble glides to the tab, stretching on the way, and settles;
 * - press and slide (one motion, no hold): the bubble lifts into a larger glass
 *   lens that follows the finger, the icon under it swells; release selects the
 *   tab under the finger and the lens shrinks back into the pill.
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
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const moveRef = useRef<BubbleFn | null>(null)
  const press = useRef<{ id: number; centres: number[]; pos: number; moved: boolean; x0: number } | null>(null)
  const currentRef = useRef(current)
  currentRef.current = current
  const all = [...left, ...right]
  // Stable ref setters: a new callback per render would detach/reattach the tab mid-commit.
  const setTab = useMemo(
    () =>
      all.map((_, i) => (el: HTMLAnchorElement | null) => {
        if (el) tabs.current[i] = el
      }),
    [all.length], // eslint-disable-line react-hooks/exhaustive-deps
  )

  /** Centre x of each tab relative to the bar. */
  const centres = () => {
    const base = nav.current!.getBoundingClientRect().left
    return tabs.current.map((el) => {
      const r = el!.getBoundingClientRect()
      return r.left - base + r.width / 2
    })
  }

  /** Swell the icon nearest the lens, like it's magnified. */
  const magnify = (pos: number | null) => {
    tabs.current.forEach((el, i) => {
      const svg = el?.querySelector('svg')
      if (!svg) return
      const k = pos == null ? 0 : Math.max(0, 1 - Math.abs(pos - i))
      svg.style.transform = k ? `scale(${1 + 0.22 * k})` : ''
    })
  }

  useLayoutEffect(() => {
    const move: BubbleFn = (pos, live) => {
      const b = bubble.current
      if (!b || !nav.current || tabs.current.some((t) => !t)) return
      const cs = centres()
      const w0 = tabs.current[0]!.getBoundingClientRect().width
      const i = Math.max(0, Math.min(cs.length - 1, Math.floor(pos)))
      const f = Math.max(0, Math.min(1, pos - i))
      const c = cs[i] + ((cs[i + 1] ?? cs[i]) - cs[i]) * f
      clearTimeout(settle.current)
      b.style.width = `${w0}px`
      const at = `translate3d(${c - w0 / 2}px, 0, 0)`
      if (live) {
        // Lifted lens: bigger than the pill, follows the finger 1:1.
        b.classList.add('lifted')
        b.style.transition = 'transform 70ms linear'
        b.style.transform = `${at} scale(1.32, 1.24)`
      } else {
        b.classList.remove('lifted')
        // Glide: stretch along the way and overshoot a touch, then settle round.
        b.style.transition = `transform 400ms ${SPRING}`
        b.style.transform = `${at} scale(1.16, 0.94)`
        settle.current = setTimeout(() => {
          b.style.transition = `transform 260ms ${EASE}`
          b.style.transform = `${at} scale(1)`
        }, 190)
      }
    }
    moveRef.current = move
    bind(move)
    // First placement without animation.
    const b = bubble.current
    move(current, false)
    clearTimeout(settle.current)
    if (b) {
      b.style.transition = 'none'
      b.style.transform = b.style.transform.replace('scale(1.16, 0.94)', 'scale(1)')
    }
    const onResize = () => move(currentRef.current, false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Fractional tab index for a finger at bar-relative x. */
  const posAt = (x: number, cs: number[]) => {
    if (x <= cs[0]) return 0
    for (let i = 0; i < cs.length - 1; i++) if (x <= cs[i + 1]) return i + (x - cs[i]) / (cs[i + 1] - cs[i])
    return cs.length - 1
  }

  const release = (select: boolean) => {
    const p = press.current
    press.current = null
    magnify(null)
    if (!p) return
    const i = Math.round(p.pos)
    // Shrink the lens back into the pill where it lands; navigation re-settles it too.
    moveRef.current?.(select ? i : currentRef.current, false)
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
        if (!(e.target as HTMLElement).closest('.tab:not(.tab-add)')) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const cs = centres()
        const x = e.clientX - nav.current!.getBoundingClientRect().left
        const pos = posAt(x, cs)
        press.current = { id: e.pointerId, centres: cs, pos, moved: false, x0: e.clientX }
        // The lens lifts under the finger straight away.
        moveRef.current?.(pos, true)
        magnify(pos)
      }}
      onPointerMove={(e) => {
        const p = press.current
        if (!p || p.id !== e.pointerId) return
        if (Math.abs(e.clientX - p.x0) > 6) p.moved = true
        p.pos = posAt(e.clientX - nav.current!.getBoundingClientRect().left, p.centres)
        moveRef.current?.(p.pos, true)
        magnify(p.pos)
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
