import { describe, expect, it } from 'vitest'

import { fetchCall, jsonResponse, makeEntity, mockFetch } from '@/test/utils'

import { createEntity, deleteEntity, listEntities, updateEntity } from './api'
import type { EntityInput } from './model'

const input: EntityInput = {
  name: 'Truck 01',
  type: 'vehicle',
  status: 'active',
  description: '',
  attributes: {},
  latitude: -6.2,
  longitude: 106.8,
}

describe('entities api', () => {
  it('lists entities with the filter encoded as query parameters', async () => {
    const entity = makeEntity()
    const fetchMock = mockFetch(jsonResponse({ items: [entity], count: 1 }))

    const result = await listEntities({
      type: 'vehicle',
      search: '  truck ',
      bbox: [106.6, -6.4, 107, -6],
    })

    expect(result).toEqual([entity])
    const url = new URL(fetchCall(fetchMock).url, 'http://localhost')
    expect(url.pathname).toBe('/api/v1/entities')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      type: 'vehicle',
      search: 'truck',
      bbox: '106.6,-6.4,107,-6',
    })
  })

  it('creates an entity with POST', async () => {
    const fetchMock = mockFetch(jsonResponse(makeEntity(), 201))

    await createEntity(input)

    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/v1/entities')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(input)
  })

  it('updates an entity with PUT on its URL', async () => {
    const entity = makeEntity()
    const fetchMock = mockFetch(jsonResponse(entity))

    await updateEntity(entity.id, input)

    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe(`/api/v1/entities/${entity.id}`)
    expect(init.method).toBe('PUT')
  })

  it('deletes an entity', async () => {
    const fetchMock = mockFetch(new Response(null, { status: 204 }))

    await deleteEntity('abc')

    const { url, init } = fetchCall(fetchMock)
    expect(url).toBe('/api/v1/entities/abc')
    expect(init.method).toBe('DELETE')
  })
})
