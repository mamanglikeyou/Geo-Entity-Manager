import { describe, expect, it } from 'vitest'

import { ApiError } from '@/lib/http'
import { makeEntity } from '@/test/utils'

import {
  entityFormSchema,
  parseLocation,
  toEntityInput,
  toFormValues,
  toServerFormErrors,
  type EntityFormValues,
} from './form'

const valid: EntityFormValues = {
  name: '  Truck 01 ',
  type: 'vehicle',
  status: 'active',
  description: '',
  latitude: '-6.2088',
  longitude: '106.8456',
  attributes: [
    { key: 'plate_number', value: 'B 1234 XYZ' },
    { key: '', value: '' },
  ],
}

function errorPaths(values: EntityFormValues) {
  const result = entityFormSchema.safeParse(values)
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'))
}

describe('entityFormSchema', () => {
  it('accepts valid input, trims text and parses coordinates', () => {
    const parsed = entityFormSchema.parse(valid)

    expect(parsed.name).toBe('Truck 01')
    expect(parsed.latitude).toBe(-6.2088)
    expect(toEntityInput(parsed)).toEqual({
      name: 'Truck 01',
      type: 'vehicle',
      status: 'active',
      description: '',
      latitude: -6.2088,
      longitude: 106.8456,
      // The blank row is dropped.
      attributes: { plate_number: 'B 1234 XYZ' },
    })
  })

  it.each<[string, Partial<EntityFormValues>, string[]]>([
    ['blank name', { name: '   ' }, ['name']],
    ['name over 100 characters', { name: 'a'.repeat(101) }, ['name']],
    ['no type chosen', { type: '' }, ['type']],
    ['unknown status', { status: 'broken' }, ['status']],
    ['missing latitude', { latitude: '' }, ['latitude']],
    ['latitude is not a number', { latitude: 'north' }, ['latitude']],
    ['longitude out of range', { longitude: '181' }, ['longitude']],
    [
      'attribute value without key',
      { attributes: [{ key: '', value: 'x' }] },
      ['attributes.0.key'],
    ],
    [
      'attribute key with spaces',
      { attributes: [{ key: 'plate no', value: 'x' }] },
      ['attributes.0.key'],
    ],
    [
      'duplicate attribute keys',
      {
        attributes: [
          { key: 'a', value: '1' },
          { key: 'a', value: '2' },
        ],
      },
      ['attributes.1.key'],
    ],
    [
      'too many attributes',
      { attributes: Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, value: 'v' })) },
      ['attributes'],
    ],
  ])('rejects %s', (_, override, paths) => {
    expect(errorPaths({ ...valid, ...override })).toEqual(paths)
  })

  it('counts characters like the backend, so 100 emoji are allowed', () => {
    expect(errorPaths({ ...valid, name: '📍'.repeat(100) })).toEqual([])
  })
})

describe('toFormValues', () => {
  it('prefills a new entity from the map location', () => {
    expect(toFormValues(undefined, { latitude: -6.123456789, longitude: 106.8 })).toMatchObject({
      latitude: '-6.123457',
      longitude: '106.8',
      status: 'active',
      type: '',
    })
  })

  it('turns an entity into editable text and attribute rows', () => {
    const values = toFormValues(makeEntity())

    expect(values.latitude).toBe('-6.2088')
    expect(values.attributes).toEqual([{ key: 'plate_number', value: 'B 1234 XYZ' }])
  })
})

describe('parseLocation', () => {
  it('returns null until both coordinates are valid', () => {
    expect(parseLocation('-6.2', '')).toBeNull()
    expect(parseLocation('-6.2', 'east')).toBeNull()
    expect(parseLocation('-6.2', '106.8')).toEqual({ latitude: -6.2, longitude: 106.8 })
  })
})

describe('toServerFormErrors', () => {
  const rows = [{ key: 'plate_number', value: 'x' }]

  it('maps validation details to fields, resolving attribute keys to rows', () => {
    const error = new ApiError(422, 'VALIDATION_FAILED', 'validation failed', [
      { field: 'name', message: 'is required' },
      { field: 'attributes.plate_number', message: 'must be at most 200 characters' },
      { field: 'something_new', message: 'is invalid' },
    ])

    expect(toServerFormErrors(error, rows)).toEqual({
      fields: [
        { path: 'name', message: 'Is required' },
        { path: 'attributes.0.value', message: 'Must be at most 200 characters' },
      ],
      form: 'something_new: is invalid',
    })
  })

  it('reports other failures as a form-level message', () => {
    const error = new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server.')

    expect(toServerFormErrors(error, rows)).toEqual({
      fields: [],
      form: 'Cannot reach the server.',
    })
  })
})
