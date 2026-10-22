import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { jsonResponse, makeEntity, mockFetch, renderWithQueryClient } from '@/test/utils'

import { EntityList } from './EntityList'

describe('EntityList', () => {
  it('shows each entity with its type and status', async () => {
    mockFetch(
      jsonResponse({
        items: [
          makeEntity(),
          makeEntity({
            id: '7d1f0c3a-2b4e-4f6a-8c9d-0e1f2a3b4c5d',
            name: 'Depot Surabaya',
            type: 'facility',
            status: 'maintenance',
          }),
        ],
        count: 2,
      }),
    )

    renderWithQueryClient(<EntityList />)

    expect(await screen.findByText('Truck 01')).toBeInTheDocument()
    expect(screen.getByText('Vehicle')).toBeInTheDocument()
    expect(screen.getByText('Depot Surabaya')).toBeInTheDocument()
    expect(screen.getByText('Maintenance')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    mockFetch(jsonResponse({ items: [], count: 0 }))

    renderWithQueryClient(<EntityList />)

    expect(await screen.findByText('No entities yet.')).toBeInTheDocument()
  })

  it('shows the error and lets the user retry', async () => {
    mockFetch(
      jsonResponse({ error: { code: 'INTERNAL_ERROR', message: 'internal server error' } }, 500),
      jsonResponse({ items: [makeEntity()], count: 1 }),
    )

    renderWithQueryClient(<EntityList />)

    expect(await screen.findByRole('alert')).toHaveTextContent('internal server error')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Truck 01')).toBeInTheDocument()
  })
})
