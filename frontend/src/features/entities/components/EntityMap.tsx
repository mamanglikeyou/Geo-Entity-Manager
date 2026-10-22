import 'maplibre-gl/dist/maplibre-gl.css'

import { setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useMemo, useState, type Ref } from 'react'
import Map, {
  Layer,
  NavigationControl,
  Source,
  type LayerProps,
  type MapEvent,
  type MapMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'

import { boundsToBBox, toFeatureCollection } from '../map'
import {
  ENTITY_STATUSES,
  ENTITY_STATUS_COLORS as COLORS,
  ENTITY_STATUS_LABELS,
  type BoundingBox,
  type Entity,
} from '../model'

// MapLibre derives its worker URL at runtime from a template string that
// bundlers cannot see, so after bundling it points at a missing file. Give
// it the URL of the worker Vite builds instead (`?worker` matters: a plain
// `?url` is served with Vite's client injected, which breaks in a worker).
setWorkerUrl(workerUrl)

const MAP_STYLE_URL =
  import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'

// Centred on Indonesia, where the sample data lives.
const INITIAL_VIEW = { longitude: 113.9, latitude: -2.5, zoom: 4 }

const SOURCE_ID = 'entities'
const CLUSTER_LAYER_ID = 'entity-clusters'
const POINT_LAYER_ID = 'entity-points'
const INTERACTIVE_LAYER_IDS = [CLUSTER_LAYER_ID, POINT_LAYER_ID]

const clusterLayer: LayerProps = {
  id: CLUSTER_LAYER_ID,
  type: 'circle',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#2563eb',
    'circle-opacity': 0.85,
    'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
}

const clusterCountLayer: LayerProps = {
  id: 'entity-cluster-count',
  type: 'symbol',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': ['Noto Sans Bold'],
    'text-size': 12,
  },
  paint: { 'text-color': '#ffffff' },
}

const pointLayer: LayerProps = {
  id: POINT_LAYER_ID,
  type: 'circle',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': [
      'match',
      ['get', 'status'],
      'active',
      COLORS.active,
      'inactive',
      COLORS.inactive,
      'maintenance',
      COLORS.maintenance,
      'offline',
      COLORS.offline,
      COLORS.inactive,
    ],
    'circle-radius': 7,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
}

interface EntityMapProps {
  ref?: Ref<MapRef>
  entities: readonly Entity[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onViewportChange: (bbox: BoundingBox) => void
}

/**
 * Entities are drawn as a clustered GeoJSON layer rather than one DOM marker
 * each: WebGL layers stay smooth with thousands of points, DOM markers do not.
 */
export function EntityMap({
  ref,
  entities,
  selectedId,
  onSelect,
  onViewportChange,
}: EntityMapProps) {
  const [cursor, setCursor] = useState<string>()
  const data = useMemo(() => toFeatureCollection(entities), [entities])

  const reportViewport = (event: MapEvent) => {
    onViewportChange(boundsToBBox(event.target.getBounds()))
  }

  const handleClick = (event: MapMouseEvent) => {
    // Query at the click point instead of using event.features: react-map-gl
    // fills that from the last mousemove, which is stale or missing when a
    // click or tap arrives without one (touch screens, keyboard, automation).
    const [feature] = event.target.queryRenderedFeatures(event.point, {
      layers: INTERACTIVE_LAYER_IDS,
    })
    if (!feature) {
      onSelect(null)
      return
    }

    if (feature.layer.id === CLUSTER_LAYER_ID) {
      const clusterId: unknown = feature.properties.cluster_id
      const source = event.target.getSource<GeoJSONSource>(SOURCE_ID)
      if (typeof clusterId !== 'number' || !source || feature.geometry.type !== 'Point') return

      const center = feature.geometry.coordinates as [number, number]
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        event.target.easeTo({ center, zoom })
      })
      return
    }

    const id: unknown = feature.properties.id
    if (typeof id === 'string') onSelect(id)
  }

  return (
    <Map
      ref={ref}
      initialViewState={INITIAL_VIEW}
      mapStyle={MAP_STYLE_URL}
      attributionControl={{ compact: true }}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      cursor={cursor}
      onMouseEnter={() => {
        setCursor('pointer')
      }}
      onMouseLeave={() => {
        setCursor(undefined)
      }}
      onClick={handleClick}
      onLoad={reportViewport}
      onMoveEnd={reportViewport}
    >
      <NavigationControl position="top-right" showCompass={false} />

      <Source
        id={SOURCE_ID}
        type="geojson"
        data={data}
        cluster
        clusterMaxZoom={14}
        clusterRadius={50}
      >
        <Layer {...clusterLayer} />
        <Layer {...clusterCountLayer} />
        <Layer
          id="entity-selected"
          type="circle"
          filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'id'], selectedId ?? '']]}
          paint={{
            'circle-radius': 13,
            'circle-color': '#2563eb',
            'circle-opacity': 0.25,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#2563eb',
          }}
        />
        <Layer {...pointLayer} />
      </Source>

      <MapLegend />
    </Map>
  )
}

function MapLegend() {
  return (
    <ul className="absolute bottom-8 left-2 space-y-1 rounded-md bg-white/90 px-2.5 py-2 text-xs shadow">
      {ENTITY_STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ backgroundColor: COLORS[status] }}
          />
          {ENTITY_STATUS_LABELS[status]}
        </li>
      ))}
    </ul>
  )
}
