import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse, makeEntity, renderWithQueryClient, routeFetch } from '@/test/utils'

import type { BoundingBox, Entity } from '../model'
import { EntityExplorer } from './EntityExplorer'

// MapLibre needs WebGL, which jsdom does not have. The stub reports a fixed
// viewport like the real map does on load, and renders one button per marker.
vi.mock('./EntityMap', async () => {
  const { useEffect } = await import('react')
  return {
    EntityMap: ({
      entities,
      onSelect,
      onViewportChange,
    }: {
      entities: readonly Entity[]
      onSelect: (id: string) => void
      onViewportChange: (bbox: BoundingBox) => void
    }) => {
      useEffect(() => {
        onViewportChange([106, -7, 108, -5])
      }, [onViewportChange])
      return (
        <div>
          {entities.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                onSelect(e.id)
              }}
            >
              marker {e.name}
            </button>
          ))}
        </div>
      )
    },
  }
})

const truck = makeEntity()
const sensor = makeEntity({
  id: '7d1f0c3a-2b4e-4f6a-8c9d-0e1f2a3b4c5d',
  name: 'Air Quality Sensor',
  type: 'iot_device',
  status: 'offline',
})

function setupApi() {
  return routeFetch({
    '/api/v1/entities': () => jsonResponse({ items: [truck, sensor], count: 2 }),
    [`/api/v1/entities/${truck.id}`]: () => jsonResponse(truck),
    [`/api/v1/entities/${sensor.id}`]: () => jsonResponse(sensor),
  })
}

function listRequests(fetchMock: ReturnType<typeof routeFetch>) {
  return fetchMock.mock.calls
    .map(([input]) => new URL(input as string, 'http://localhost'))
    .filter((url) => url.pathname === '/api/v1/entities')
}

describe('EntityExplorer', () => {
  it('loads the entities inside the map viewport', async () => {
    const fetchMock = setupApi()

    renderWithQueryClient(<EntityExplorer />)

    expect(await screen.findByRole('button', { name: /^Truck 01/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'marker Air Quality Sensor' })).toBeInTheDocument()

    const [request] = listRequests(fetchMock)
    expect(request?.searchParams.get('bbox')).toBe('106,-7,108,-5')
    expect(request?.searchParams.get('limit')).toBe('500')
  })

  it('opens the details of an entity picked from the list, and closes them', async () => {
    setupApi()
    renderWithQueryClient(<EntityExplorer />)

    await userEvent.click(await screen.findByRole('button', { name: /^Truck 01/ }))

    expect(screen.getByRole('heading', { name: 'Truck 01' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))

    expect(screen.getByRole('searchbox', { name: 'Search by name' })).toBeInTheDocument()
  })

  it('opens the details of an entity clicked on the map', async () => {
    setupApi()
    renderWithQueryClient(<EntityExplorer />)

    await userEvent.click(await screen.findByRole('button', { name: 'marker Air Quality Sensor' }))

    expect(screen.getByRole('heading', { name: 'Air Quality Sensor' })).toBeInTheDocument()
  })

  it('searches by name once the user stops typing', async () => {
    const fetchMock = setupApi()
    renderWithQueryClient(<EntityExplorer />)
    await screen.findByRole('button', { name: /^Truck 01/ })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name' }), 'sensor')

    await waitFor(() => {
      expect(listRequests(fetchMock).at(-1)?.searchParams.get('search')).toBe('sensor')
    })
    // Debounced: one request for the final text, not one per keystroke.
    expect(listRequests(fetchMock).filter((u) => u.searchParams.has('search'))).toHaveLength(1)
  })
})
