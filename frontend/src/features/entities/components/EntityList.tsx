import { Button } from '@/components/ui/Button'

import { ENTITY_TYPE_LABELS } from '../model'
import { useEntities } from '../queries'
import { StatusBadge } from './StatusBadge'

export function EntityList() {
  const { data: entities, isPending, isError, error, refetch } = useEntities()

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
    return <p className="p-4 text-sm text-slate-500">No entities yet.</p>
  }

  return (
    <ul className="divide-y divide-slate-200">
      {entities.map((entity) => (
        <li key={entity.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{entity.name}</p>
            <p className="text-xs text-slate-500">{ENTITY_TYPE_LABELS[entity.type]}</p>
          </div>
          <StatusBadge status={entity.status} />
        </li>
      ))}
    </ul>
  )
}
