import { lazy, Suspense, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

import { Button } from '@/components/ui/Button'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

import { EMPTY_FILTERS } from '../filters'
import { focusEntity } from '../map'
import type { BoundingBox, Entity, EntityFilter, GeoPoint } from '../model'
import { useEntities } from '../queries'
import { EntityDetail } from './EntityDetail'
import { CreateEntityForm, EditEntityForm } from './EntityEditor'
import { EntityFilters } from './EntityFilters'
import { EntityList } from './EntityList'

// MapLibre is most of the bundle; loading it separately lets the rest of the
// UI render first and keeps the map library cached across app releases.
const EntityMap = lazy(() => import('./EntityMap').then((m) => ({ default: m.EntityMap })))

const LIST_LIMIT = 500
const SEARCH_DEBOUNCE_MS = 300

/** What the side panel shows. Only one thing at a time, so one state value. */
type Panel =
  | { view: 'list' }
  | { view: 'detail'; id: string }
  | { view: 'create'; initialLocation: GeoPoint | null }
  | { view: 'edit'; id: string }

/**
 * The main screen: a map plus a side panel that shows the filtered list of
 * entities in view, the details of one, or the form to create or edit one.
 * Map and list share one query, so they always show the same entities.
 */
export function EntityExplorer() {
  const mapRef = useRef<MapRef>(null)
  const [panel, setPanel] = useState<Panel>({ view: 'list' })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [bbox, setBBox] = useState<BoundingBox | null>(null)
  // Picked: where the user last clicked or dragged on the map (map -> form).
  // Draft: where the form's coordinates currently point (form -> map pin).
  const [pickedLocation, setPickedLocation] = useState<GeoPoint | null>(null)
  const [draftLocation, setDraftLocation] = useState<GeoPoint | null>(null)
  const search = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS)

  const filter: EntityFilter = {
    search,
    type: filters.type || undefined,
    status: filters.status || undefined,
    bbox: bbox ?? undefined,
    limit: LIST_LIMIT,
  }
  // Wait for the map to report its viewport; querying without a bbox first
  // would load entities from the whole world only to discard them.
  const entitiesQuery = useEntities(filter, { enabled: bbox !== null })

  const editing = panel.view === 'create' || panel.view === 'edit'
  const selectedId = panel.view === 'detail' || panel.view === 'edit' ? panel.id : null

  const show = (next: Panel) => {
    if (next.view !== 'create' && next.view !== 'edit') {
      setPickedLocation(null)
      setDraftLocation(null)
    }
    setPanel(next)
  }

  const showSaved = (entity: Entity) => {
    show({ view: 'detail', id: entity.id })
    focusEntity(mapRef.current, entity)
  }

  const startCreate = () => {
    // Start at the map centre so the new pin is visible right away.
    const center = mapRef.current?.getCenter()
    show({
      view: 'create',
      initialLocation: center ? { latitude: center.lat, longitude: center.lng } : null,
    })
  }

  const formProps = {
    pickedLocation,
    onLocationChange: setDraftLocation,
    onSaved: showSaved,
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
      <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white md:w-96 md:flex-none md:border-t-0 md:border-r">
        {panel.view === 'create' ? (
          <CreateEntityForm
            {...formProps}
            initialLocation={panel.initialLocation}
            onCancel={() => {
              show({ view: 'list' })
            }}
          />
        ) : panel.view === 'edit' ? (
          <EditEntityForm
            {...formProps}
            entityId={panel.id}
            onCancel={() => {
              show({ view: 'detail', id: panel.id })
            }}
          />
        ) : panel.view === 'detail' ? (
          <EntityDetail
            entityId={panel.id}
            onClose={() => {
              show({ view: 'list' })
            }}
            onEdit={() => {
              show({ view: 'edit', id: panel.id })
            }}
            onDeleted={() => {
              show({ view: 'list' })
            }}
          />
        ) : (
          <>
            <div className="space-y-3 border-b border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Entities</h2>
                <Button onClick={startCreate}>New entity</Button>
              </div>
              <EntityFilters value={filters} onChange={setFilters} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EntityList
                query={entitiesQuery}
                limit={LIST_LIMIT}
                onSelect={(entity) => {
                  show({ view: 'detail', id: entity.id })
                  focusEntity(mapRef.current, entity)
                }}
              />
            </div>
          </>
        )}
      </aside>

      <div className="relative h-[50dvh] shrink-0 md:h-auto md:flex-1">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center text-sm text-slate-500">
              Loading map…
            </div>
          }
        >
          <EntityMap
            ref={mapRef}
            entities={entitiesQuery.data ?? []}
            selectedId={selectedId}
            onSelect={(id) => {
              show(id ? { view: 'detail', id } : { view: 'list' })
            }}
            onViewportChange={setBBox}
            picking={editing}
            draftLocation={draftLocation}
            onPickLocation={setPickedLocation}
          />
        </Suspense>
      </div>
    </div>
  )
}
