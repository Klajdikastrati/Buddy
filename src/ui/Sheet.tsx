import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { closeSheet, finishClose, useSheetClosing } from './sheets'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Pinned under the content, above the keyboard. */
  footer?: ReactNode
}

const EXIT_MS = 240

/**
 * Bottom sheet on the native <dialog>: focus trap, Esc and backdrop for free.
 * Slides up on open, slides down on every close (also after Save), and can
 * be dragged down by its header. Put `data-autofocus` on the field that should
 * take focus — opening happens in a layout effect so focus() lands inside the
 * tap (iOS only raises the keyboard for focus during a user gesture).
 */
export function Sheet({ open, onClose, title, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const closing = useSheetClosing()
  // App-wide sheets close through the store (which waits for the animation); local ones via `open`.
  const global = onClose === closeSheet
  const visible = open && !(global && closing)
  const [mounted, setMounted] = useState(visible)
  const drag = useRef<{ id: number; y0: number; t0: number; dy: number } | null>(null)

  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (visible) {
      setMounted(true)
      d.classList.remove('leaving')
      if (!d.open) {
        d.showModal()
        // showModal focuses the first control; move focus without scrolling anything
        // (the panel is still off-screen, mid-slide).
        const target = d.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current
        target?.focus({ preventScroll: true })
        d.scrollTop = 0
      }
      return
    }
    if (!d.open) return
    // Exit: slide down from wherever the panel is (it may be mid-drag).
    d.classList.add('leaving')
    const p = panel.current
    if (p) {
      p.style.transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`
      p.style.transform = 'translate3d(0, 100%, 0)'
    }
    const t = setTimeout(() => {
      d.close()
      d.classList.remove('leaving')
      setMounted(false)
      if (global) finishClose()
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [visible, global])

  const end = (cancel: boolean, velocity = 0) => {
    const d = drag.current
    const p = panel.current
    drag.current = null
    if (!d || !p) return
    if (!cancel && (d.dy > 110 || velocity > 0.6)) onClose()
    else {
      p.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
      p.style.transform = ''
    }
  }

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={() => visible && onClose()}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {(visible || mounted) && (
        <div ref={panel} className="sheet-panel" tabIndex={-1}>
          <header
            className="sheet-head"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return
              drag.current = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 }
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              const p = panel.current
              if (!d || !p || e.pointerId !== d.id) return
              d.dy = Math.max(0, e.clientY - d.y0)
              p.style.transition = 'none'
              p.style.transform = `translate3d(0, ${d.dy}px, 0)`
            }}
            onPointerUp={(e) => {
              const d = drag.current
              if (!d || e.pointerId !== d.id) return
              end(false, d.dy / Math.max(1, performance.now() - d.t0))
            }}
            onPointerCancel={() => end(true)}
          >
            <h2>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} strokeWidth={2.4} />
            </button>
          </header>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
