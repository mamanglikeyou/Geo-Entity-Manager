import type { InputHTMLAttributes, Ref } from 'react'

export const controlClasses =
  'block w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600 focus:outline-none disabled:bg-slate-50 aria-[invalid=true]:ring-red-500'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
}

export function Input({ className = '', ...props }: InputProps) {
  return <input className={`${controlClasses} ${className}`} {...props} />
}
