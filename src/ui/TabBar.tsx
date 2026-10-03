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
 * Floating glass tab bar (iOS / Instagram style). A bubble sits behind the
 * current tab; during a swipe it follows the finger and swells slightly, then
 * springs into place. The + stays dead centre between the two groups.
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
    const move: BubbleFn = (pos, live) => {
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
        b.style.transition = 'none'
        b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1.12)`
      } else {
        // Spring home: overshoot a touch, swell while travelling, settle at 1.
        b.style.transition = 'transform 460ms cubic-bezier(0.34, 1.45, 0.5, 1)'
        b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1.1)`
        settle.current = setTimeout(() => {
          b.style.transition = 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'
          b.style.transform = `translate3d(${c - w / 2}px, 0, 0) scale(1)`
        }, 240)
      }
    }
    bind(move)
    // First placement without animation.
    const b = bubble.current
    if (b) b.style.transition = 'none'
    move(current, true)
    if (b) b.style.transform = b.style.transform.replace('scale(1.12)', 'scale(1)')
    const onResize = () => move(current, false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    <nav ref={nav} className="tabbar" aria-label="Main">
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
