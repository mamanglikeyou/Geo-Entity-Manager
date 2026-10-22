import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'

import { createEntity, deleteEntity, getEntity, listEntities, updateEntity } from './api'
import type { Entity, EntityFilter, EntityInput } from './model'

export const entityKeys = {
  all: ['entities'] as const,
  lists: () => [...entityKeys.all, 'list'] as const,
  list: (filter: EntityFilter) => [...entityKeys.lists(), filter] as const,
  details: () => [...entityKeys.all, 'detail'] as const,
  detail: (id: string) => [...entityKeys.details(), id] as const,
}

export function useEntities(filter: EntityFilter = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: entityKeys.list(filter),
    queryFn: ({ signal }) => listEntities(filter, signal),
    enabled,
    // Keep showing the previous results while a new filter or viewport
    // loads, so markers do not flicker away on every change.
    placeholderData: keepPreviousData,
  })
}

export function useEntity(id: string | undefined) {
  const queryClient = useQueryClient()
  // Explicit type argument: otherwise TData is inferred from placeholderData.
  return useQuery<Entity>({
    queryKey: entityKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getEntity(id ?? '', signal),
    enabled: id !== undefined,
    // Show the copy already loaded by a list immediately, while the detail
    // request fetches the latest version in the background.
    placeholderData: () => findInLists(queryClient, id),
  })
}

function findInLists(queryClient: QueryClient, id: string | undefined): Entity | undefined {
  for (const [, entities] of queryClient.getQueriesData<Entity[]>({
    queryKey: entityKeys.lists(),
  })) {
    const match = entities?.find((e) => e.id === id)
    if (match) return match
  }
  return undefined
}

// Lists are filtered server-side, so after any write we cannot patch them
// reliably in place; refetching every list is simpler and always correct.
function syncAfterWrite(queryClient: QueryClient, entity: Entity) {
  queryClient.setQueryData(entityKeys.detail(entity.id), entity)
  return queryClient.invalidateQueries({ queryKey: entityKeys.lists() })
}

export function useCreateEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: EntityInput) => createEntity(input),
    onSuccess: (entity) => syncAfterWrite(queryClient, entity),
  })
}

export function useUpdateEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EntityInput }) => updateEntity(id, input),
    onSuccess: (entity) => syncAfterWrite(queryClient, entity),
  })
}

export function useDeleteEntity() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEntity(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: entityKeys.detail(id) })
      return queryClient.invalidateQueries({ queryKey: entityKeys.lists() })
    },
  })
}
