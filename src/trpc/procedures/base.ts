/**
 * Base Procedure & tRPC Instance
 *
 * Core building blocks - import these in other procedure files
 *
 * SSE CONFIGURATION:
 * This file configures tRPC with Server-Sent Events support for realtime subscriptions.
 * The SSE config enables ping messages to keep connections alive and handles reconnection.
 *
 * SOURCE OF TRUTH KEYWORDS: tRPCBase, SSEConfig
 */

import { initTRPC } from '@trpc/server'
import type { Context } from '../init'

/**
 * Initialize tRPC with context and SSE support
 *
 * WHY: Enable Server-Sent Events for realtime subscriptions
 * HOW: SSE config enables ping messages and client reconnection
 */
const t = initTRPC.context<Context>().create({
  /**
   * SSE Configuration for realtime subscriptions
   *
   * WHY: Enable Server-Sent Events transport for subscription procedures
   * HOW: Configures max duration, ping interval, and client reconnection
   *
   * PRODUCTION NOTES:
   * - maxDurationMs matches route.ts maxDuration (300s)
   * - ping prevents proxy timeouts (Cloudflare, nginx, etc.)
   * - client.reconnect enables automatic reconnection on disconnect
   */
  sse: {
    /**
     * Maximum duration for SSE connections
     * WHY: Prevents indefinite connections; client auto-reconnects after timeout
     * HOW: Server closes connection after this duration; tracked() enables resume
     *
     * NOTE: This works in tandem with route.ts maxDuration export
     */
    maxDurationMs: 5 * 60 * 1_000, // 5 minutes (matches official tRPC example)
    /**
     * Ping configuration to keep connections alive
     * WHY: Prevents proxy timeouts and detects dead connections
     * HOW: Server sends ping messages at specified interval
     */
    ping: {
      enabled: true,
      intervalMs: 10_000, // 10 seconds
    },
    /**
     * Client-side reconnection settings
     * WHY: Allows clients to automatically reconnect after connection loss
     */
    client: {
      reconnectAfterInactivityMs: 15_000, // 15 seconds
    },
  },
})

// Export core building blocks
export const router = t.router
export const baseProcedure = t.procedure
export const middleware = t.middleware
