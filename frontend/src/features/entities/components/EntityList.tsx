import type { UseQueryResult } from '@tanstack/react-query'

import { Button } from '@/components/ui/Button'

import { ENTITY_TYPE_LABELS, type Entity } from '../model'
import { StatusBadge } from './StatusBadge'

interface EntityListProps {
  query: UseQueryResult<Entity[]>
  limit: number
  onSelect: (entity: Entity) => void
}

export function EntityList({ query, limit, onSelect }: EntityListProps) {
  const { data: entities, isPending, isError, error, refetch } = query

  if (isPending) {
    return <p className="p-4 text-sm text-slate-500">Loading entities…</p>
  }

  if (isError) {
    return (
      <div role="alert" className="space-y-3 p-4">
        <p className="text-sm text-red-700">{error.message}</p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <p className="p-4 text-sm text-slate-500">No entities in this area match your filters.</p>
    )
  }

  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-xs text-slate-500">
        {entities.length === 1 ? '1 entity' : `${entities.length} entities`} in view
        {entities.length >= limit && ` — showing the first ${limit}, zoom in to see more`}
      </p>
      <ul>
        {entities.map((entity) => (
          <li key={entity.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(entity)
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{entity.name}</span>
                <span className="block text-xs text-slate-500">
                  {ENTITY_TYPE_LABELS[entity.type]}
                </span>
              </span>
              <StatusBadge status={entity.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
