import { z } from 'zod'

// Mirrors the backend enums (internal/entity/entity.go).
export const ENTITY_TYPES = ['vehicle', 'iot_device', 'facility', 'other'] as const
export const ENTITY_STATUSES = ['active', 'inactive', 'maintenance', 'offline'] as const

export type EntityType = (typeof ENTITY_TYPES)[number]
export type EntityStatus = (typeof ENTITY_STATUSES)[number]

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  vehicle: 'Vehicle',
  iot_device: 'IoT device',
  facility: 'Facility',
  other: 'Other',
}

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  maintenance: 'Maintenance',
  offline: 'Offline',
}

// API responses are parsed rather than cast, so a contract mismatch with the
// backend fails loudly at the boundary instead of deep inside a component.
export const entitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(ENTITY_TYPES),
  status: z.enum(ENTITY_STATUSES),
  description: z.string(),
  attributes: z.record(z.string(), z.string()),
  latitude: z.number(),
  longitude: z.number(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const entityListSchema = z.object({
  items: z.array(entitySchema),
  count: z.number(),
})

export type Entity = z.infer<typeof entitySchema>

export interface EntityInput {
  name: string
  type: EntityType
  status: EntityStatus
  description: string
  attributes: Record<string, string>
  latitude: number
  longitude: number
}

/** [minLng, minLat, maxLng, maxLat] */
export type BoundingBox = readonly [number, number, number, number]

export interface EntityFilter {
  type?: EntityType
  status?: EntityStatus
  search?: string
  bbox?: BoundingBox
  limit?: number
}
