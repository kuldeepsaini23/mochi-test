/**
 * Realtime Client Hook
 *
 * WHY: Type-safe client-side subscription to realtime events
 * HOW: Uses createRealtime() for typed useRealtime hook
 *
 * USAGE:
 * ```tsx
 * import { useRealtime } from '@/lib/realtime-client'
 *
 * function MyComponent() {
 *   useRealtime({
 *     events: ['inbox.emailReceived', 'inbox.chatReceived'],
 *     onData({ event, data }) {
 *       if (data.organizationId === myOrgId) {
 *         // Handle event
 *       }
 *     },
 *   })
 * }
 * ```
 *
 * SOURCE OF TRUTH KEYWORDS: RealtimeClient, RealtimeHook
 */

'use client'

import { createRealtime } from '@upstash/realtime/client'
import type { RealtimeEvents } from './realtime'

export const { useRealtime } = createRealtime<RealtimeEvents>()
