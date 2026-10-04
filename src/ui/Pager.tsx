import { useLayoutEffect, useState, type ReactNode } from 'react'
import { PageGate, PageGateContext } from './live'

// The main tabs, iOS-style: every page stays mounted (instant switch, scroll
// position kept) and switching tabs is a quick fade in place — no sideways
// slide. Pushed screens (Stack) still slide in from the right.

export const NAV_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const NAV_MS = 340

export function Pager({
  index,
  covered,
  pages,
  onPosition,
}: {
  index: number
  /** Settled tab index — drives the tab bubble. */
  onPosition?: (pos: number, live: boolean) => void
  /** A pushed screen is on top: shift back and dim. */
  covered: boolean
  pages: ReactNode[]
}) {
  const [gates] = useState(() => pages.map(() => new PageGate()))

  // Only the visible page reacts to writes.
  useLayoutEffect(() => gates.forEach((g, i) => g.set(covered || i !== index)), [index, covered, gates])
  useLayoutEffect(() => onPosition?.(index, false), [index]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`pager ${covered ? 'covered' : ''}`}>
      {pages.map((page, i) => (
        <div key={i} className={`page ${i === index ? 'active' : ''}`} data-page={i} inert={i !== index || covered} aria-hidden={i !== index}>
          <PageGateContext.Provider value={gates[i]}>{page}</PageGateContext.Provider>
        </div>
      ))}
      <div className="pager-dim" aria-hidden="true" />
    </div>
  )
}

/** Scroll a tab's page back to the top (tapping the active tab). */
export function scrollPageTop(index: number) {
  document.querySelector<HTMLElement>(`.page[data-page="${index}"]`)?.scrollTo({ top: 0, behavior: 'smooth' })
}
