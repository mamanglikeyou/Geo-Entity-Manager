import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { EntityList } from '@/features/entities/components/EntityList'

import { createQueryClient } from './queryClient'

export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-dvh flex-col bg-slate-50 text-slate-900">
        <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4">
          <h1 className="text-base font-semibold">Geo Entity Manager</h1>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-md">
            <EntityList />
          </div>
        </main>
      </div>
    </QueryClientProvider>
  )
}
