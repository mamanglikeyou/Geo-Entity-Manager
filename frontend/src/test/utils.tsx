import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'

import type { Entity } from '@/features/entities/model'

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Replaces global fetch for the current test; restored by `unstubGlobals`. */
export function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response)
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Returns the URL and init of the nth fetch call (0-based). */
export function fetchCall(fetchMock: ReturnType<typeof mockFetch>, n = 0) {
  const call = fetchMock.mock.calls[n]
  if (!call)
    throw new Error(`fetch was called ${fetchMock.mock.calls.length} times, wanted call #${n}`)
  const [input, init] = call
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return { url, init: init ?? {} }
}

export function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

export function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: '0b6c8f2e-8d0a-4c55-9f43-1f5a2d3e4b6c',
    name: 'Truck 01',
    type: 'vehicle',
    status: 'active',
    description: '',
    attributes: { plate_number: 'B 1234 XYZ' },
    latitude: -6.2088,
    longitude: 106.8456,
    createdAt: '2026-10-22T14:58:45.791039Z',
    updatedAt: '2026-10-22T14:58:45.791039Z',
    ...overrides,
  }
}
