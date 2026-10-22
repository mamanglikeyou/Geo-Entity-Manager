import { useEffect, useId, useRef, type ReactNode } from 'react'

import { Button } from './Button'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  pendingLabel?: string
  isPending?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A modal confirmation for destructive actions. Focus starts on Cancel so an
 * accidental Enter does not confirm, and Escape cancels.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel = confirmLabel,
  isPending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isPending, onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm space-y-4 rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        <div className="text-sm text-slate-600">{children}</div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
