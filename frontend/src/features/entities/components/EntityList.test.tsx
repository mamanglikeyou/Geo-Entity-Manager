import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse, makeEntity, mockFetch, renderWithQueryClient } from '@/test/utils'

import type { Entity } from '../model'
import { useEntities } from '../queries'
import { EntityList } from './EntityList'

function Harness({
  limit = 500,
  onSelect = vi.fn(),
}: {
  limit?: number
  onSelect?: (e: Entity) => void
}) {
  const query = useEntities()
  return <EntityList query={query} limit={limit} onSelect={onSelect} />
}

const depot = makeEntity({
  id: '7d1f0c3a-2b4e-4f6a-8c9d-0e1f2a3b4c5d',
  name: 'Depot Surabaya',
  type: 'facility',
  status: 'maintenance',
})

describe('EntityList', () => {
  it('shows each entity with its type, status and the total in view', async () => {
    mockFetch(jsonResponse({ items: [makeEntity(), depot], count: 2 }))

    renderWithQueryClient(<Harness />)

    expect(await screen.findByText('Truck 01')).toBeInTheDocument()
    expect(screen.getByText('Vehicle')).toBeInTheDocument()
    expect(screen.getByText('Depot Surabaya')).toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
    expect(screen.getByText(/2 entities in view/)).toBeInTheDocument()
  })

  it('hints to zoom in when the result hit the limit', async () => {
    mockFetch(jsonResponse({ items: [makeEntity(), depot], count: 2 }))

    renderWithQueryClient(<Harness limit={2} />)

    expect(await screen.findByText(/zoom in to see more/)).toBeInTheDocument()
  })

  it('reports the clicked entity', async () => {
    const onSelect = vi.fn()
    mockFetch(jsonResponse({ items: [makeEntity(), depot], count: 2 }))

    renderWithQueryClient(<Harness onSelect={onSelect} />)
    await userEvent.click(await screen.findByRole('button', { name: /Depot Surabaya/ }))

    expect(onSelect).toHaveBeenCalledWith(depot)
  })

  it('shows an empty state', async () => {
    mockFetch(jsonResponse({ items: [], count: 0 }))

    renderWithQueryClient(<Harness />)

    expect(await screen.findByText(/No entities in this area/)).toBeInTheDocument()
  })

  it('shows the error and lets the user retry', async () => {
    mockFetch(
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'internal server error' } }, 500),
      jsonResponse({ items: [makeEntity()], count: 1 }),
    )

    renderWithQueryClient(<Harness />)

    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Truck 01')).toBeInTheDocument()
  })
})
