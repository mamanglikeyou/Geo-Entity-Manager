import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/http'
import { makeEntity, renderWithQueryClient } from '@/test/utils'

import { toFormValues } from '../form'
import type { GeoPoint } from '../model'
import { EntityForm, type EntityFormProps } from './EntityForm'

function renderForm(overrides: Partial<EntityFormProps> = {}) {
  const props: EntityFormProps = {
    title: 'New entity',
    submitLabel: 'Create entity',
    initialValues: toFormValues(undefined, null),
    pickedLocation: null,
    onLocationChange: vi.fn(),
    onSubmit: vi.fn(() => Promise.resolve(makeEntity())),
    onSaved: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  const view = renderWithQueryClient(<EntityForm {...props} />)
  return { props, ...view }
}

describe('EntityForm', () => {
  it('submits the entered values as an EntityInput', async () => {
    const { props } = renderForm()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Name'), 'Truck 01')
    await user.selectOptions(screen.getByLabelText('Type'), 'Vehicle')
    await user.type(screen.getByLabelText('Latitude'), '-6.2')
    await user.type(screen.getByLabelText('Longitude'), '106.8')
    await user.click(screen.getByRole('button', { name: 'Add attribute' }))
    await user.type(screen.getByLabelText('Attribute 1 key'), 'plate_number')
    await user.type(screen.getByLabelText('Attribute 1 value'), 'B 1')
    await user.click(screen.getByRole('button', { name: 'Create entity' }))

    await waitFor(() => {
      expect(props.onSaved).toHaveBeenCalled()
    })
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: 'Truck 01',
      type: 'vehicle',
      status: 'active',
      description: '',
      latitude: -6.2,
      longitude: 106.8,
      attributes: { plate_number: 'B 1' },
    })
  })

  it('shows every client-side error and does not submit', async () => {
    const { props } = renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Create entity' }))

    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Choose a type')).toBeInTheDocument()
    expect(screen.getByText('Latitude is required')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Name is required')
    expect(props.onSubmit).not.toHaveBeenCalled()
  })

  it('shows server validation errors on the matching fields', async () => {
    const entity = makeEntity()
    renderForm({
      initialValues: toFormValues(entity),
      onSubmit: () =>
        Promise.reject(
          new ApiError(422, 'VALIDATION_FAILED', 'validation failed', [
            { field: 'name', message: 'is already taken' },
          ]),
        ),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Create entity' }))

    expect(await screen.findByText('Is already taken')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows other failures at the top of the form', async () => {
    renderForm({
      initialValues: toFormValues(makeEntity()),
      onSubmit: () => Promise.reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.')),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Create entity' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.')
  })

  it('fills the coordinates from a location picked on the map', async () => {
    const onLocationChange = vi.fn()
    const { props, rerender } = renderForm({ onLocationChange })
    const picked: GeoPoint = { latitude: -6.1234567, longitude: 106.9 }

    rerender(<EntityForm {...props} pickedLocation={picked} />)

    await waitFor(() => {
      expect(screen.getByLabelText('Latitude')).toHaveValue('-6.123457')
    })
    expect(screen.getByLabelText('Longitude')).toHaveValue('106.9')
    expect(onLocationChange).toHaveBeenLastCalledWith({ latitude: -6.123457, longitude: 106.9 })
  })

  it('reports typed coordinates so the map can show the pin', async () => {
    const onLocationChange = vi.fn()
    renderForm({ onLocationChange })

    await userEvent.type(screen.getByLabelText('Latitude'), '-6.5')
    await userEvent.type(screen.getByLabelText('Longitude'), '107')

    expect(onLocationChange).toHaveBeenLastCalledWith({ latitude: -6.5, longitude: 107 })
  })
})
