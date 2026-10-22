import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { EntityExplorer } from '@/features/entities/components/EntityExplorer'

import { createQueryClient } from './queryClient'

export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4">
          <h1 className="text-base font-semibold">Geo Entity Manager</h1>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          <EntityExplorer />
        </main>
      </div>
    </QueryClientProvider>
  )
}
