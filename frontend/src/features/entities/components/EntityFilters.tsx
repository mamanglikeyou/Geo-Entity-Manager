import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

import type { EntityFilterValues } from '../filters'
import {
  ENTITY_STATUSES,
  ENTITY_STATUS_LABELS,
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  type EntityStatus,
  type EntityType,
} from '../model'

interface EntityFiltersProps {
  value: EntityFilterValues
  onChange: (value: EntityFilterValues) => void
}

export function EntityFilters({ value, onChange }: EntityFiltersProps) {
  return (
    <div className="space-y-2">
      <Input
        type="search"
        aria-label="Search by name"
        placeholder="Search by name…"
        value={value.search}
        onChange={(e) => {
          onChange({ ...value, search: e.target.value })
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Filter by type"
          value={value.type}
          onChange={(e) => {
            onChange({ ...value, type: e.target.value as EntityType | '' })
          }}
        >
          <option value="">All types</option>
          {ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {ENTITY_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={value.status}
          onChange={(e) => {
            onChange({ ...value, status: e.target.value as EntityStatus | '' })
          }}
        >
          <option value="">All statuses</option>
          {ENTITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ENTITY_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
