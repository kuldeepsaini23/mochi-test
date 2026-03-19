/**
 * tRPC Server Utilities
 *
 * WHY: Enables server components to call tRPC procedures and prefetch data for hydration.
 * HOW: Import { trpc } for queries (await trpc.hello.query()), import { getQueryClient }
 *      for prefetching (queryClient.prefetchQuery(trpc.hello.queryOptions())).
 */

import 'server-only';

import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { cache } from 'react';
import { createTRPCContext } from './init';
import { makeQueryClient } from './tanstack-config';
import { appRouter } from './routers/_app';

/**
 * Cached Query Client Getter
 * WHY: Server components need query client for prefetching. Must be cached per request.
 * HOW: Used with HydrationBoundary to pass prefetched data to client components.
 */
export const getQueryClient = cache(makeQueryClient);

/**
 * Server tRPC Proxy
 * WHY: Typed tRPC calls in server components (await trpc.procedure.query()).
 * HOW: Uses router directly, no HTTP. Returns queryOptions() for prefetching or query() for direct calls.
 */
export const trpc = createTRPCOptionsProxy({
  ctx: createTRPCContext,
  router: appRouter,
  queryClient: getQueryClient,
});

/**
 * Direct Caller Factory (Bypass Cache)
 * WHY: When you need to call procedures without TanStack Query cache (e.g., mutations, server actions).
 * HOW: const api = await createCaller(); await api.procedure({ input });
 */
export const createCaller = async () => appRouter.createCaller(await createTRPCContext());

/**
 * Typed tRPC Caller
 * WHY: Used by Mochi AI tools to call tRPC procedures with full middleware enforcement
 * (permissions, feature gates, Stripe connect) instead of bypassing via direct service calls.
 *
 * SOURCE OF TRUTH KEYWORDS: TRPCCaller, MochiToolsCaller
 */
export type TRPCCaller = Awaited<ReturnType<typeof createCaller>>

/**
 * Cached User Organizations with Permissions
 *
 * WHY: Single source of truth for user's organizations and permissions across server components.
 *      Deduplicates fetches during SSR and makes data available in tRPC context.
 *
 * HOW: React's cache() ensures only one fetch per request. Call this in:
 *      - Server components (direct call)
 *      - tRPC context (adds to ctx)
 *      - Layout (for hydration to client)
 *
 * CACHE LIFECYCLE:
 * - Auto-purged on each new request (request-scoped)
 * - Client-side cache purged via invalidateQueries on role/permission changes
 *
 * @returns User's organizations with role and permissions array
 */
export const getUserOrganizationsWithPermissions = cache(async () => {
  const api = await createCaller()

  try {
    return await api.organization.getUserOrganizations()
  } catch (error) {
    // Handle errors gracefully - return empty array if user not authenticated or no orgs
    return []
  }
});
