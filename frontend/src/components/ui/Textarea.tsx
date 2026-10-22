import type { Ref, TextareaHTMLAttributes } from 'react'

import { controlClasses } from './Input'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>
}

export function Textarea({ className = '', rows = 3, ...props }: TextareaProps) {
  return <textarea rows={rows} className={`${controlClasses} ${className}`} {...props} />
}
