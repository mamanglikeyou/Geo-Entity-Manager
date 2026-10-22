import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: an icon-only button has no visible text to name it. */
  'aria-label': string
}

export function IconButton({ className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex size-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600 ${className}`}
      {...props}
    />
  )
}

export function CloseIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-5">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  )
}
