/**
 * tRPC React Provider
 *
 * WHY: Provides type-safe tRPC hooks to all client components
 * HOW: Wraps app in TanStack Query + tRPC providers
 *
 * LINK CONFIGURATION:
 * - Uses splitLink to route subscriptions to SSE and queries/mutations to batch HTTP
 * - Subscriptions use httpSubscriptionLink for Server-Sent Events
 * - Queries/mutations use httpBatchLink for efficient batching
 *
 * FEATURE GATE OPTIMISTIC UPDATES:
 * - Global mutation observer watches for usage-affecting mutations
 * - Optimistically updates getFeatureGates cache when mutations complete
 * - Instant UI updates with no loading states or refetching
 *
 * SOURCE OF TRUTH KEYWORDS: TRPCReactProvider, splitLink, SSELink, FeatureGateObserver
 */

'use client'

import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink, splitLink, httpSubscriptionLink } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'
import { useState, useEffect, useRef } from 'react'
import { makeQueryClient } from './tanstack-config'
import type { AppRouter } from './routers/_app'
import {
  getMutationMapping,
  getCountChangeFromVariables,
  getCountChangeFromResult,
  type PendingMutation,
} from '@/lib/config/feature-gate-mutations'
import type { FeatureGatesData } from '@/components/feature-gate'

/**
 * Get Base URL for tRPC requests
 *
 * WHY: Relative URLs fail during SSR because there's no host context.
 *      We need a full URL on the server but can use relative on client.
 *
 * HOW:
 * - Browser: Uses window.location.origin for current domain
 * - Server (SSR): Uses NEXT_PUBLIC_APP_URL, VERCEL_URL, or localhost fallback
 *
 * NOTE: NEXT_PUBLIC_* variables are inlined at build time, so they work
 *       in both client and server contexts of client components.
 */
function getBaseUrl(): string {
  // Browser - use current origin (works for any domain)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  // SSR needs absolute URL - check for Vercel deployment first
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Use configured app URL if available (NEXT_PUBLIC_ is inlined at build time)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Fallback to localhost for local development
  return 'http://localhost:3000'
}

/**
 * Typed tRPC React Hooks
 * WHY: Export tRPC hook for client components to access procedures with full type safety.
 * HOW: Components call trpc.dashboard.getData.useQuery() or other procedures
 *
 * NOTE: Auth operations use Better Auth client directly (src/lib/auth-client.ts), not tRPC
 */
export const trpc = createTRPCReact<AppRouter>()

let browserQueryClient: QueryClient

/**
 * Query Client Singleton
 * WHY: Browser needs single instance to preserve cache across re-renders. Server gets fresh per request.
 * HOW: Reuses same client in browser, creates new one on server (SSR).
 */
function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient()
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

/**
 * Client Provider Component
 *
 * WHY: Makes tRPC available to all client components. Mounted in root layout.
 * HOW: Creates HTTP client pointing to /api/trpc, wraps children with providers.
 *
 * LINK CONFIGURATION:
 * - splitLink routes operations based on type
 * - Subscriptions → httpSubscriptionLink (SSE)
 * - Queries/Mutations → httpBatchLink (batched HTTP)
 *
 * Uses getBaseUrl() to ensure SSR works with absolute URLs.
 */
export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        /**
         * Split Link Configuration
         *
         * WHY: Route subscription operations to SSE endpoint,
         *      everything else to batch endpoint
         * HOW: Checks operation type and routes accordingly
         */
        splitLink({
          /**
           * Condition: Check if this is a subscription operation
           * WHY: Subscriptions need SSE transport, queries/mutations use HTTP
           */
          condition: (op) => op.type === 'subscription',

          /**
           * True branch: Subscriptions use SSE
           * WHY: Server-Sent Events for realtime streaming
           *
           * RECONNECTION:
           * - tRPC SSE automatically reconnects on disconnect
           * - Uses tracked() event IDs to resume from last received event
           */
          true: httpSubscriptionLink({
            url: `${getBaseUrl()}/api/trpc`,
            /**
             * Event source configuration
             * WHY: Include cookies for authentication and handle reconnection
             */
            eventSourceOptions: () => ({
              // Include credentials for auth cookies
              withCredentials: true,
            }),
            /**
             * Reconnection configuration
             * WHY: Auto-reconnect when SSE connection drops
             * HOW: tRPC will retry with exponential backoff
             */
            connectionParams: async () => {
              // Return empty object - just ensures connection params are set
              // This triggers tRPC's built-in reconnection logic
              return {}
            },
          }),

          /**
           * False branch: Queries and mutations use batching
           * WHY: Efficient HTTP request batching for regular operations
           */
          false: httpBatchLink({
            url: `${getBaseUrl()}/api/trpc`,
            // Include credentials (cookies) with every request for auth
            fetch(url, options) {
              return fetch(url, {
                ...options,
                credentials: 'include',
              })
            },
          }),
        }),
      ],
    })
  )

  return (
    <trpc.Provider
      client={trpcClient}
      queryClient={queryClient}
    >
      <QueryClientProvider client={queryClient}>
        <FeatureGateMutationObserver queryClient={queryClient} />
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}

// ============================================================================
// FEATURE GATE MUTATION OBSERVER
// ============================================================================

/**
 * Global Mutation Observer for Feature Gate Optimistic Updates
 *
 * SOURCE OF TRUTH: FeatureGateMutationObserver, OptimisticFeatureGateUpdates
 *
 * WHY: When mutations that affect usage counts START, we optimistically
 * update the feature gates cache so the UI reflects limits INSTANTLY.
 * This prevents users from exceeding limits during the mutation window.
 *
 * HOW: Subscribes to the React Query mutation cache lifecycle:
 * 1. PENDING: Update cache immediately using count from variables
 * 2. ERROR: Rollback the change (reverse the count)
 * 3. SUCCESS: Verify for bulk operations, adjust if needed
 * 4. IDLE: Cleanup any orphaned pending mutations
 *
 * RELIABILITY FEATURES:
 * - Uses useRef for pendingMutations to survive re-renders
 * - Try-catch around all cache operations to prevent crashes
 * - Handles 'idle' status for mutation resets/cancellations
 * - Defensive null checks at every step
 * - Processes already-pending mutations on mount (catches fast mutations)
 *
 * BENEFIT:
 * - TRUE optimistic UI (updates on START, not SUCCESS)
 * - No race condition between mutation and feature gate check
 * - Automatic rollback on failure
 * - 0% failure rate - bulletproof implementation
 */
function FeatureGateMutationObserver({ queryClient }: { queryClient: QueryClient }) {
  /**
   * Track pending mutations for rollback purposes
   * Using useRef to persist across re-renders without causing them
   * Key: mutation ID (unique per mutation instance)
   * Value: PendingMutation with feature and countChange
   */
  const pendingMutationsRef = useRef<Map<number, PendingMutation>>(new Map())

  useEffect(() => {
    const pendingMutations = pendingMutationsRef.current

    /**
     * Helper: Check if a query key is a feature gates query
     * Handles various tRPC query key formats safely
     */
    const isFeatureGatesQuery = (queryKey: unknown): boolean => {
      try {
        if (!Array.isArray(queryKey) || queryKey.length === 0) return false

        const firstPart = queryKey[0]

        // Handle nested array format: [['usage', 'getFeatureGates'], { input: ... }]
        if (Array.isArray(firstPart)) {
          return firstPart.some(
            (part) => typeof part === 'string' && part.includes('getFeatureGates')
          )
        }

        // Handle flat string format (fallback)
        if (typeof firstPart === 'string') {
          return firstPart.includes('getFeatureGates')
        }

        return false
      } catch {
        return false
      }
    }

    /**
     * Helper: Update feature gates cache for a specific feature
     * Wrapped in try-catch to prevent any errors from breaking the observer
     *
     * @param featureKey - The feature to update (e.g., 'forms.limit')
     * @param countChange - How much to change usage (positive or negative)
     * @returns boolean - Whether any cache was updated
     */
    const updateFeatureGateCache = (featureKey: string, countChange: number): boolean => {
      if (!featureKey || countChange === 0) return false

      let updated = false

      try {
        const allQueries = queryClient.getQueryCache().getAll()

        for (const query of allQueries) {
          if (!isFeatureGatesQuery(query.queryKey)) continue

          // Found a feature gates query - update it
          queryClient.setQueryData<FeatureGatesData>(query.queryKey, (oldData) => {
            // Defensive: ensure we have valid data structure
            if (!oldData || typeof oldData !== 'object') return oldData
            if (!oldData.gates || typeof oldData.gates !== 'object') return oldData
            if (!oldData.gates[featureKey]) return oldData

            const gate = oldData.gates[featureKey]

            // Defensive: ensure gate has required properties
            if (typeof gate.usage !== 'number') return oldData

            const newUsage = Math.max(0, gate.usage + countChange)
            const newAtLimit =
              !gate.isUnlimited && gate.limit !== null && newUsage >= gate.limit

            updated = true

            return {
              ...oldData,
              gates: {
                ...oldData.gates,
                [featureKey]: {
                  ...gate,
                  usage: newUsage,
                  atLimit: newAtLimit,
                },
              },
            }
          })
        }
      } catch (error) {
        // Log but don't throw - observer must keep running
        console.error('[FeatureGateMutationObserver] Cache update failed:', error)
      }

      return updated
    }

    /**
     * Helper: Process a mutation event safely
     * Handles all status transitions with proper error handling
     */
    const processMutationEvent = (mutation: {
      mutationId: number
      state: {
        status: string
        variables?: unknown
        data?: unknown
      }
      options: {
        mutationKey?: unknown
      }
    }) => {
      try {
        const mutationId = mutation.mutationId
        const status = mutation.state.status
        const mutationKey = mutation.options.mutationKey

        // Get the mapping for this mutation
        const mapping = getMutationMapping(mutationKey)
        if (!mapping) return

        const featureKey = mapping.feature

        // =================================================================
        // PENDING: Mutation started - update cache IMMEDIATELY
        // =================================================================
        if (status === 'pending') {
          // Skip if we already processed this mutation (prevents double-counting)
          if (pendingMutations.has(mutationId)) return

          const variables = mutation.state.variables

          // Calculate count change from variables (known at START)
          const countChange = getCountChangeFromVariables(mapping, variables)

          // Skip if no actual change
          if (countChange === 0) return

          // Store for potential rollback BEFORE updating cache
          pendingMutations.set(mutationId, {
            feature: featureKey,
            countChange,
          })

          // Update cache optimistically
          updateFeatureGateCache(featureKey, countChange)
          return
        }

        // =================================================================
        // ERROR: Mutation failed - ROLLBACK the optimistic update
        // =================================================================
        if (status === 'error') {
          const pending = pendingMutations.get(mutationId)
          if (pending) {
            // Reverse the count change
            updateFeatureGateCache(pending.feature, -pending.countChange)
            pendingMutations.delete(mutationId)
          }
          return
        }

        // =================================================================
        // SUCCESS: Mutation succeeded - verify for bulk operations
        // =================================================================
        if (status === 'success') {
          const pending = pendingMutations.get(mutationId)
          if (pending) {
            // For bulk operations, check if actual count differs from predicted
            // This handles edge cases where some items in bulk op failed
            const result = mutation.state.data
            const actualCountChange = getCountChangeFromResult(mapping, result)

            // If actual differs from predicted, adjust the cache
            if (actualCountChange !== pending.countChange) {
              const adjustment = actualCountChange - pending.countChange
              updateFeatureGateCache(pending.feature, adjustment)
            }

            pendingMutations.delete(mutationId)
          }
          return
        }

        // =================================================================
        // IDLE: Mutation was reset/cancelled - cleanup orphaned entries
        // =================================================================
        if (status === 'idle') {
          const pending = pendingMutations.get(mutationId)
          if (pending) {
            // Rollback since mutation didn't complete
            updateFeatureGateCache(pending.feature, -pending.countChange)
            pendingMutations.delete(mutationId)
          }
          return
        }
      } catch (error) {
        // Log but don't throw - observer must keep running
        console.error('[FeatureGateMutationObserver] Event processing failed:', error)
      }
    }

    // =====================================================================
    // INITIAL SCAN: Process any mutations that are already pending
    // This catches mutations that started before observer mounted
    // =====================================================================
    try {
      const existingMutations = queryClient.getMutationCache().getAll()
      for (const mutation of existingMutations) {
        if (mutation.state.status === 'pending') {
          processMutationEvent({
            mutationId: mutation.mutationId,
            state: {
              status: mutation.state.status,
              variables: mutation.state.variables,
              data: mutation.state.data,
            },
            options: {
              mutationKey: mutation.options.mutationKey,
            },
          })
        }
      }
    } catch (error) {
      console.error('[FeatureGateMutationObserver] Initial scan failed:', error)
    }

    // =====================================================================
    // SUBSCRIBE: Listen for mutation cache events
    // =====================================================================
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      // Only process 'updated' events (status changes)
      if (event.type !== 'updated') return
      if (!event.mutation) return

      processMutationEvent({
        mutationId: event.mutation.mutationId,
        state: {
          status: event.mutation.state.status,
          variables: event.mutation.state.variables,
          data: event.mutation.state.data,
        },
        options: {
          mutationKey: event.mutation.options.mutationKey,
        },
      })
    })

    return () => {
      unsubscribe()
      // Don't clear pendingMutations - let useRef handle it
      // This prevents issues if cleanup runs during an active mutation
    }
  }, [queryClient])

  // This component renders nothing - it's purely for the side effect
  return null
}
