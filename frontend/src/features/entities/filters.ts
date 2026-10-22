import type { EntityStatus, EntityType } from './model'

/** Filter form state; '' means "any", matching an unselected <select>. */
export interface EntityFilterValues {
  search: string
  type: EntityType | ''
  status: EntityStatus | ''
}

export const EMPTY_FILTERS: EntityFilterValues = { search: '', type: '', status: '' }
