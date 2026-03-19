/**
 * Realtime SSE Route Handler
 *
 * WHY: Handles Server-Sent Events for realtime pub/sub
 * HOW: Uses @upstash/realtime handle() for SSE connection management
 *
 * ENDPOINT: GET /api/realtime
 *
 * SECURITY WARNING: This endpoint currently has NO authentication.
 * All events are broadcast to all connected SSE clients. Security
 * relies on client-side filtering by organizationId. Sensitive data
 * (PII, messages) could be exposed to unauthenticated listeners.
 *
 * TODO: Implement channel-level authorization with signed tokens
 * so only authenticated org members can subscribe to their org's events.
 *
 * SOURCE OF TRUTH KEYWORDS: RealtimeSSE, RealtimeRouteHandler
 */

import { handle } from '@upstash/realtime'
import { realtime } from '@/lib/realtime'

export const GET = handle({ realtime })
