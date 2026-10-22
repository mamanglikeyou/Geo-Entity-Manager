import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { jsonResponse, makeEntity, renderWithQueryClient, routeFetch } from '@/test/utils'

import { EntityDetail } from './EntityDetail'

const entity = makeEntity({
  description: 'Delivery truck for the Jakarta area',
  attributes: { plate_number: 'B 1234 XYZ', driver: 'Budi' },
})
const detailPath = `/api/v1/entities/${entity.id}`

function renderDetail(overrides: Partial<Parameters<typeof EntityDetail>[0]> = {}) {
  const props = {
    entityId: entity.id,
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  }
  renderWithQueryClient(<EntityDetail {...props} />)
  return props
}

describe('EntityDetail', () => {
  it('shows the entity fields, coordinates and attributes', async () => {
    routeFetch({ [detailPath]: () => jsonResponse(entity) })

    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Truck 01' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Delivery truck for the Jakarta area')).toBeInTheDocument()
    expect(screen.getByText('-6.208800, 106.845600')).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'plate_number' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Budi' })).toBeInTheDocument()
  })

  it('explains when the entity no longer exists, without offering actions', async () => {
    routeFetch({})

    renderDetail()

    expect(await screen.findByRole('alert')).toHaveTextContent('This entity no longer exists.')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('closes and starts editing', async () => {
    routeFetch({ [detailPath]: () => jsonResponse(entity) })
    const props = renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }))

    expect(props.onEdit).toHaveBeenCalledOnce()
    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('deletes after confirmation', async () => {
    const fetchMock = routeFetch({
      [detailPath]: () => new Response(null, { status: 204 }),
    })
    // The first GET must return the entity; later calls (the DELETE) get 204.
    fetchMock.mockResolvedValueOnce(jsonResponse(entity))
    const props = renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete entity?' })
    expect(dialog).toHaveTextContent('Truck 01 will be removed permanently')

    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1) as HTMLElement)

    await waitFor(() => {
      expect(props.onDeleted).toHaveBeenCalledOnce()
    })
    const methods = fetchMock.mock.calls.map(([, init]) => init?.method ?? 'GET')
    expect(methods).toContain('DELETE')
  })

  it('cancels deletion with Escape', async () => {
    routeFetch({ [detailPath]: () => jsonResponse(entity) })
    const props = renderDetail()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(props.onDeleted).not.toHaveBeenCalled()
  })
})
