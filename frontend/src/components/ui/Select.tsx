import type { Ref, SelectHTMLAttributes } from 'react'

import { controlClasses } from './Input'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>
}

export function Select({ className = '', ...props }: SelectProps) {
  return <select className={`${controlClasses} pr-8 ${className}`} {...props} />
}
