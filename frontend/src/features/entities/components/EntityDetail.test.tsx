import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse, makeEntity, renderWithQueryClient, routeFetch } from '@/test/utils'

import { EntityDetail } from './EntityDetail'

const entity = makeEntity({
  description: 'Delivery truck for the Jakarta area',
  attributes: { plate_number: 'B 1234 XYZ', driver: 'Budi' },
})
const detailPath = `/api/v1/entities/${entity.id}`

describe('EntityDetail', () => {
  it('shows the entity fields, coordinates and attributes', async () => {
    routeFetch({ [detailPath]: () => jsonResponse(entity) })

    renderWithQueryClient(<EntityDetail entityId={entity.id} onClose={vi.fn()} />)

    expect(await screen.findByRole('heading', { name: 'Truck 01' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Delivery truck for the Jakarta area')).toBeInTheDocument()
    expect(screen.getByText('-6.208800, 106.845600')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'plate_number' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Budi' })).toBeInTheDocument()
  })

  it('explains when the entity no longer exists', async () => {
    routeFetch({})

    renderWithQueryClient(<EntityDetail entityId={entity.id} onClose={vi.fn()} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('This entity no longer exists.')
  })

  it('closes', async () => {
    const onClose = vi.fn()
    routeFetch({ [detailPath]: () => jsonResponse(entity) })

    renderWithQueryClient(<EntityDetail entityId={entity.id} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
