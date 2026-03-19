/**
 * tRPC API Route Handler
 *
 * WHY: Exposes tRPC router as HTTP endpoint for client to call via /api/trpc
 * HOW: Receives requests from client's httpBatchLink, runs procedures through appRouter,
 *      returns typed responses. Context created per request via createTRPCContext.
 *
 * SSE CONFIGURATION:
 * - runtime: 'nodejs' - Required for proper SSE streaming (Edge runtime has issues)
 * - maxDuration: Extended for long-running SSE connections
 * - dynamic: 'force-dynamic' - Disable static optimization
 *
 * SOURCE OF TRUTH KEYWORDS: tRPCRouteHandler, SSERoute
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/trpc/routers/_app'
import { createTRPCContext } from '@/trpc/init'

/**
 * Force Node.js runtime for SSE streaming
 * WHY: Edge runtime has issues with long-running SSE connections
 */
export const runtime = 'nodejs'

/**
 * Extend max duration for SSE connections
 * WHY: SSE connections need to stay open for realtime events (default is 10s on Vercel)
 * HOW: Set to maximum allowed (300s on Vercel Hobby, 900s on Pro)
 *
 * NOTE: For local development, this is effectively unlimited
 * In production, SSE will auto-reconnect via tRPC's tracked() mechanism
 */
export const maxDuration = 300

/**
 * Disable static caching for this route
 * WHY: SSE and mutations must always be dynamic
 */
export const dynamic = 'force-dynamic'

/**
 * Next.js API route handler for tRPC
 * WHY: Makes tRPC accessible over HTTP for client components
 * HOW: Handles GET (queries/subscriptions) and POST (mutations) at /api/trpc/[procedure]
 *
 * SSE STREAMING:
 * - responseInit callback adds headers to prevent response buffering
 * - These headers tell proxies/browsers to not buffer the SSE stream
 */
const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    /**
     * Response initialization for SSE streaming
     * WHY: Add headers that prevent response buffering by proxies and Next.js
     * HOW: Detect SSE requests and add appropriate headers
     */
    responseMeta: ({ type }) => {
      // For subscriptions (SSE), add streaming headers
      if (type === 'subscription') {
        return {
          headers: {
            // Prevent proxy buffering (nginx, cloudflare, etc.)
            'X-Accel-Buffering': 'no',
            // Disable caching for SSE
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            // Keep connection alive
            Connection: 'keep-alive',
          },
        }
      }
      return {}
    },
  })

export { handler as GET, handler as POST }
