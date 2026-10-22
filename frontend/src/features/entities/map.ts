import type { FeatureCollection, Point } from 'geojson'
import type { MapRef } from 'react-map-gl/maplibre'

import type { BoundingBox, Entity, EntityStatus, EntityType } from './model'

export interface EntityFeatureProperties {
  id: string
  name: string
  type: EntityType
  status: EntityStatus
}

export function toFeatureCollection(
  entities: readonly Entity[],
): FeatureCollection<Point, EntityFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: entities.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.longitude, e.latitude] },
      properties: { id: e.id, name: e.name, type: e.type, status: e.status },
    })),
  }
}

interface Bounds {
  getWest(): number
  getSouth(): number
  getEast(): number
  getNorth(): number
}

// Four decimals is ~11 m: precise enough for a viewport, and it keeps tiny
// sub-pixel camera changes from producing a new query key each time.
const round = (n: number) => Math.round(n * 1e4) / 1e4
const clamp = (n: number, limit: number) => Math.min(Math.max(n, -limit), limit)

/**
 * Converts map bounds to the API's bbox. When zoomed out the map shows copies
 * of the world, so longitudes can exceed ±180; they are clamped to the valid
 * range (the API does not support boxes crossing the antimeridian).
 */
export function boundsToBBox(bounds: Bounds): BoundingBox {
  return [
    round(clamp(bounds.getWest(), 180)),
    round(clamp(bounds.getSouth(), 90)),
    round(clamp(bounds.getEast(), 180)),
    round(clamp(bounds.getNorth(), 90)),
  ]
}

const FOCUS_ZOOM = 13

/** Moves the camera to an entity, without zooming out if already closer. */
export function focusEntity(map: MapRef | null, entity: Entity) {
  if (!map) return
  map.flyTo({
    center: [entity.longitude, entity.latitude],
    zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
    duration: 800,
  })
}
