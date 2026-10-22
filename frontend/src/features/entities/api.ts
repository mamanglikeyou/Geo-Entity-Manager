import { apiRequest } from '@/lib/http'

import { entityListSchema, entitySchema } from './model'
import type { Entity, EntityFilter, EntityInput } from './model'

const BASE_PATH = '/api/v1/entities'

const entityPath = (id: string) => `${BASE_PATH}/${encodeURIComponent(id)}`

export async function listEntities(
  filter: EntityFilter = {},
  signal?: AbortSignal,
): Promise<Entity[]> {
  const { items } = await apiRequest(BASE_PATH, {
    query: {
      type: filter.type,
      status: filter.status,
      search: filter.search?.trim(),
      bbox: filter.bbox?.join(','),
      limit: filter.limit,
    },
    schema: entityListSchema,
    signal,
  })
  return items
}

export function getEntity(id: string, signal?: AbortSignal): Promise<Entity> {
  return apiRequest(entityPath(id), { schema: entitySchema, signal })
}

export function createEntity(input: EntityInput): Promise<Entity> {
  return apiRequest(BASE_PATH, { method: 'POST', body: input, schema: entitySchema })
}

export function updateEntity(id: string, input: EntityInput): Promise<Entity> {
  return apiRequest(entityPath(id), { method: 'PUT', body: input, schema: entitySchema })
}

export function deleteEntity(id: string): Promise<void> {
  return apiRequest(entityPath(id), { method: 'DELETE' })
}
