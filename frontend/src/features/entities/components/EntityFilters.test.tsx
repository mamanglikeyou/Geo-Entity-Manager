import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EMPTY_FILTERS } from '../filters'
import { EntityFilters } from './EntityFilters'

describe('EntityFilters', () => {
  it('reports a type change without touching the other filters', async () => {
    const onChange = vi.fn()
    render(<EntityFilters value={{ ...EMPTY_FILTERS, search: 'truck' }} onChange={onChange} />)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by type' }),
      'Facility',
    )

    expect(onChange).toHaveBeenCalledWith({ search: 'truck', type: 'facility', status: '' })
  })

  it('reports clearing the status back to all', async () => {
    const onChange = vi.fn()
    render(<EntityFilters value={{ ...EMPTY_FILTERS, status: 'offline' }} onChange={onChange} />)

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by status' }),
      'All statuses',
    )

    expect(onChange).toHaveBeenCalledWith(EMPTY_FILTERS)
  })
})
