import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse, makeEntity, renderWithQueryClient, routeFetch } from '@/test/utils'

import type { BoundingBox, Entity, EntityInput, GeoPoint } from '../model'
import { EntityExplorer } from './EntityExplorer'

// MapLibre needs WebGL, which jsdom does not have. The stub reports a fixed
// viewport like the real map does on load, renders one button per marker,
// and, while a form is open, a button that "clicks" a fixed map location.
vi.mock('./EntityMap', async () => {
  const { useEffect } = await import('react')
  return {
    EntityMap: ({
      entities,
      onSelect,
      onViewportChange,
      picking,
      onPickLocation,
    }: {
      entities: readonly Entity[]
      onSelect: (id: string) => void
      onViewportChange: (bbox: BoundingBox) => void
      picking: boolean
      onPickLocation: (location: GeoPoint) => void
    }) => {
      useEffect(() => {
        onViewportChange([106, -7, 108, -5])
      }, [onViewportChange])
      return (
        <div>
          {picking && (
            <button
              type="button"
              onClick={() => {
                onPickLocation({ latitude: -6.3, longitude: 106.9 })
              }}
            >
              pick location
            </button>
          )}
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

  it('creates an entity at a location picked on the map, then shows it', async () => {
    let created: EntityInput | undefined
    const depot = makeEntity({
      id: '3e65e37a-4d9f-493f-aae0-2152ec7a765f',
      name: 'Depot Bekasi',
      type: 'facility',
    })
    routeFetch({
      'GET /api/v1/entities': () => jsonResponse({ items: [truck], count: 1 }),
      'POST /api/v1/entities': (init) => {
        created = JSON.parse(init.body as string) as EntityInput
        return jsonResponse(depot, 201)
      },
      [`/api/v1/entities/${depot.id}`]: () => jsonResponse(depot),
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EntityExplorer />)

    await user.click(await screen.findByRole('button', { name: 'New entity' }))
    await user.type(screen.getByLabelText('Name'), 'Depot Bekasi')
    await user.selectOptions(screen.getByLabelText('Type'), 'Facility')
    await user.click(screen.getByRole('button', { name: 'pick location' }))
    await user.click(screen.getByRole('button', { name: 'Create entity' }))

    expect(await screen.findByRole('heading', { name: 'Depot Bekasi' })).toBeInTheDocument()
    expect(created).toMatchObject({
      name: 'Depot Bekasi',
      type: 'facility',
      latitude: -6.3,
      longitude: 106.9,
    })
  })

  it('edits an entity and returns to its details', async () => {
    let updated: EntityInput | undefined
    routeFetch({
      'GET /api/v1/entities': () => jsonResponse({ items: [truck], count: 1 }),
      [`GET /api/v1/entities/${truck.id}`]: () => jsonResponse(truck),
      [`PUT /api/v1/entities/${truck.id}`]: (init) => {
        updated = JSON.parse(init.body as string) as EntityInput
        return jsonResponse({ ...truck, ...updated })
      },
    })
    const user = userEvent.setup()
    renderWithQueryClient(<EntityExplorer />)

    await user.click(await screen.findByRole('button', { name: /^Truck 01/ }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByLabelText('Status'), 'Maintenance')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(updated).toMatchObject({ status: 'maintenance', attributes: truck.attributes })
  })

  it('goes back to the details when editing is cancelled', async () => {
    setupApi()
    const user = userEvent.setup()
    renderWithQueryClient(<EntityExplorer />)

    await user.click(await screen.findByRole('button', { name: /^Truck 01/ }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'pick location' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0] as HTMLElement)

    expect(screen.getByRole('heading', { name: 'Truck 01' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'pick location' })).not.toBeInTheDocument()
  })
})
