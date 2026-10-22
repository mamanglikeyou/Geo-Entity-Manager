import { lazy, Suspense, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'

import { useDebouncedValue } from '@/hooks/useDebouncedValue'

import { EMPTY_FILTERS } from '../filters'
import { focusEntity } from '../map'
import type { BoundingBox, Entity, EntityFilter } from '../model'
import { useEntities } from '../queries'
import { EntityDetail } from './EntityDetail'
import { EntityFilters } from './EntityFilters'
import { EntityList } from './EntityList'

// MapLibre is most of the bundle; loading it separately lets the rest of the
// UI render first and keeps the map library cached across app releases.
const EntityMap = lazy(() => import('./EntityMap').then((m) => ({ default: m.EntityMap })))

const LIST_LIMIT = 500
const SEARCH_DEBOUNCE_MS = 300

/**
 * The main screen: a map plus a side panel that shows either the filtered
 * list of entities in view or the details of the selected one. Map and list
 * share one query, so they always show the same entities.
 */
export function EntityExplorer() {
  const mapRef = useRef<MapRef>(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [bbox, setBBox] = useState<BoundingBox | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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

  const selectFromList = (entity: Entity) => {
    setSelectedId(entity.id)
    focusEntity(mapRef.current, entity)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
      <aside className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white md:w-96 md:flex-none md:border-t-0 md:border-r">
        {selectedId ? (
          <EntityDetail
            entityId={selectedId}
            onClose={() => {
              setSelectedId(null)
            }}
          />
        ) : (
          <>
            <div className="border-b border-slate-200 p-3">
              <EntityFilters value={filters} onChange={setFilters} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <EntityList query={entitiesQuery} limit={LIST_LIMIT} onSelect={selectFromList} />
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
            onSelect={setSelectedId}
            onViewportChange={setBBox}
          />
        </Suspense>
      </div>
    </div>
  )
}
