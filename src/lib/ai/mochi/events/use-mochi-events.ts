/**
 * ============================================================================
 * MOCHI AI EVENTS - REACT HOOK
 * ============================================================================
 *
 * useMochiEvents — Subscribe to Mochi AI tool events in React components.
 * Filters events by feature prefix and calls the handler.
 *
 * Usage:
 *   useMochiEvents('invoice', handler)  — only invoice events
 *   useMochiEvents('', handler)         — ALL events (for MochiWidget navigation)
 *
 * SOURCE OF TRUTH KEYWORDS: useMochiEvents, MochiEventHook
 * ============================================================================
 */

'use client'

import { useEffect, useRef } from 'react'
import { subscribeMochiEvent } from './emitter'
import type { MochiAIEvent } from './types'

/**
 * Subscribe to Mochi AI events filtered by feature.
 *
 * @param feature - Feature prefix to filter by (e.g., 'invoice', 'contract').
 *                  Pass empty string '' to receive ALL events.
 * @param handler - Callback fired when a matching event is emitted.
 *                  Wrap in useCallback if it references external deps.
 */
export function useMochiEvents(
  feature: string,
  handler: (event: MochiAIEvent) => void
): void {
  /** Stable ref to avoid re-subscribing on every handler change */
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    /** Subscribe with a filtered wrapper */
    const unsubscribe = subscribeMochiEvent((event) => {
      if (feature === '' || event.feature === feature) {
        handlerRef.current(event)
      }
    })

    return unsubscribe
  }, [feature])
}
