import { describe, expect, it } from 'vitest'

import { makeEntity } from '@/test/utils'

import { boundsToBBox, toFeatureCollection } from './map'

const bounds = (west: number, south: number, east: number, north: number) => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
})

describe('toFeatureCollection', () => {
  it('maps entities to GeoJSON points in [longitude, latitude] order', () => {
    const entity = makeEntity({ latitude: -6.2, longitude: 106.8 })

    const { features } = toFeatureCollection([entity])

    expect(features).toEqual([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [106.8, -6.2] },
        properties: { id: entity.id, name: entity.name, type: entity.type, status: entity.status },
      },
    ])
  })
})

describe('boundsToBBox', () => {
  it('rounds to four decimals', () => {
    expect(boundsToBBox(bounds(106.123456, -6.987654, 107.000049, -5.5))).toEqual([
      106.1235, -6.9877, 107, -5.5,
    ])
  })

  it('clamps a zoomed-out view that shows several copies of the world', () => {
    expect(boundsToBBox(bounds(-400, -95, 400, 95))).toEqual([-180, -90, 180, 90])
  })
})
