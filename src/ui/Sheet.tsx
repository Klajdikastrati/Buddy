import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Pinned under the content, above the keyboard. */
  footer?: ReactNode
}

/**
 * Bottom sheet on the native <dialog>: focus trap, Esc and backdrop for free.
 * Put `data-autofocus` on the field that should take focus. Opening happens in
 * a layout effect so the focus() lands inside the tap — iOS only raises the
 * keyboard for focus that happens during a user gesture.
 */
export function Sheet({ open, onClose, title, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className="sheet-panel">
          <header className="sheet-head">
            <h2>{title}</h2>
            <button type="button" className="btn-text" onClick={onClose}>
              Close
            </button>
          </header>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  )
}
