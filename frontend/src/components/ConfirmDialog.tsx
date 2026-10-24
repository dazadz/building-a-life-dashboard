import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What will be lost, in plain words. */
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** A modal check before deleting. Cancel has focus, so Enter never deletes by accident. */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      // jsdom has no showModal; fall back to a plain open dialog there
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog ref={ref} className="confirm" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
      onCancel={(e) => { e.preventDefault(); onCancel() }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="confirm-panel">
        <div className="confirm-head">
          <span className="confirm-mark" aria-hidden="true">!</span>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <div id={`${id}-body`} className="confirm-body">
          {children}
          <p className="confirm-warn">Restore it from Settings → Recently deleted for 30 days.</p>
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
