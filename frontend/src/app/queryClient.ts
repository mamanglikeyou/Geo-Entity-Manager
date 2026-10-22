import { QueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/http'

const MAX_RETRIES = 2

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx will not succeed on retry; only retry network and server errors.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.isClientError) && failureCount < MAX_RETRIES,
      },
    },
  })
}
