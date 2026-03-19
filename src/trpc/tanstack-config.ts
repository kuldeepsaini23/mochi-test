/**
 * TanStack Query Client Configuration
 *
 * WHY: Configures caching and hydration for tRPC calls
 * HOW: Used by react-provider.tsx (browser) and server.tsx (SSR)
 */

import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query'

/**
 * Query Client Factory
 *
 * WHY: Separate instances for server (per-request) and client (singleton) prevent data leaks
 * HOW: 30s staleTime prevents immediate refetches, pending queries dehydrated for streaming
 */
export const makeQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        // Disable retries globally - fail fast instead of retrying 3x
        // This prevents slow error states (especially for permission errors)
        retry: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === 'pending',
      },
    },
  })
}
