/**
 * ============================================================================
 * MOCHI AI EVENTS - CLIENT-SIDE EVENT EMITTER
 * ============================================================================
 *
 * Lightweight typed pub-sub for broadcasting Mochi AI tool events.
 * Tools emit events → subscribers (builders, widget) react in real-time.
 * No external dependencies — just a Set of listeners.
 *
 * Includes content event buffering for features where navigation and
 * content streaming happen concurrently. When the model creates a contract
 * and navigates to the builder, content events may arrive BEFORE the builder
 * component mounts and subscribes. The buffer stores these events so they
 * can be replayed when the builder is ready.
 *
 * SOURCE OF TRUTH KEYWORDS: MochiEventEmitter, emitMochiEvent
 * ============================================================================
 */

import type { MochiAIEvent } from './types'

/** Listener function signature */
type MochiEventListener = (event: MochiAIEvent) => void

/** Internal listener registry */
const listeners = new Set<MochiEventListener>()

// ============================================================================
// CONTENT EVENT BUFFERING
// ============================================================================

/**
 * Per-feature event buffers for late-subscribing components.
 *
 * WHY: When the model creates a contract and navigates to the builder,
 * content fence events (data-contract-start, data-contract, etc.) may start
 * streaming BEFORE the contract builder component mounts and registers its
 * useMochiEvents listener. These events would be lost without buffering.
 *
 * Buffer lifecycle:
 * 1. contract_content with type='start' → clear and start buffering
 * 2. contract_content with type='delta' → buffer each event
 * 3. contract_content_complete → stop buffering (buffer stays for consumption)
 * 4. consumeFeatureBuffer('contract') → returns and clears the buffer
 */
const featureBuffers = new Map<string, MochiAIEvent[]>()

/** Tracks whether we're actively buffering for a feature */
const activeBuffering = new Set<string>()

/**
 * Buffer a content event if it's part of a content streaming session.
 * Called internally by emitMochiEvent before broadcasting to listeners.
 *
 * Handles contract content fences.
 */
function bufferContentEvent(event: MochiAIEvent): void {
  const { feature, action, data } = event

  // ── Contract content buffering ──

  /** Start a new buffer when a contract content stream begins */
  if (action === 'contract_content' && data?.type === 'start') {
    console.log(`[MochiEmitter] Contract buffer START — feature: ${feature}`)
    featureBuffers.set(feature, [event])
    activeBuffering.add(feature)
    return
  }

  /** Buffer contract content deltas while the stream is active */
  if (activeBuffering.has(feature) && action === 'contract_content') {
    const buf = featureBuffers.get(feature)
    if (buf) {
      buf.push(event)
      /** Log every 50th delta to track buffering progress without flooding console */
      if (buf.length % 50 === 0) console.log(`[MochiEmitter] Contract buffer: ${buf.length} events buffered`)
    }
    return
  }

  /** Buffer the contract complete event and stop active buffering */
  if (action === 'contract_content_complete') {
    const buf = featureBuffers.get(feature)
    if (buf) buf.push(event)
    console.log(`[MochiEmitter] Contract buffer COMPLETE — total events: ${buf?.length ?? 0}`)
    activeBuffering.delete(feature)
  }

  // ── UI spec content buffering (same pattern as contract) ──

  /** Start a new buffer when a UI spec content stream begins */
  if (action === 'ui_spec_content' && data?.type === 'start') {
    featureBuffers.set(feature, [event])
    activeBuffering.add(feature)
    return
  }

  /** Buffer UI spec content deltas while the stream is active */
  if (activeBuffering.has(feature) && action === 'ui_spec_content') {
    const buf = featureBuffers.get(feature)
    if (buf) buf.push(event)
    return
  }

  /** Buffer the UI spec complete event and stop active buffering */
  if (action === 'ui_spec_content_complete') {
    const buf = featureBuffers.get(feature)
    if (buf) buf.push(event)
    activeBuffering.delete(feature)
  }
}

/**
 * Consume and clear the event buffer for a feature.
 * Called by builder components when they mount and are ready to receive events.
 * Returns all buffered events (start → deltas → complete) in order.
 *
 * IMPORTANT: Does NOT clear the `activeBuffering` flag. If a stream is still
 * active when the buffer is consumed (builder mounts mid-stream), subsequent
 * deltas must continue to be buffered so they aren't silently dropped.
 * The `activeBuffering` flag is only cleared by the completion handler
 * (contract_content_complete / ui_spec_content_complete) which naturally
 * fires when the stream ends.
 *
 * @param feature - The feature whose buffer to consume (e.g., 'contract')
 * @returns Array of buffered events, or empty array if no buffer exists
 */
export function consumeFeatureBuffer(feature: string): MochiAIEvent[] {
  const events = featureBuffers.get(feature) || []
  console.log(`[MochiEmitter] consumeFeatureBuffer('${feature}') — returning ${events.length} events, activeBuffering: ${activeBuffering.has(feature)}`)
  featureBuffers.delete(feature)
  /**
   * Re-initialize an empty buffer if the stream is still active so that
   * subsequent deltas arriving after this consume are captured in a fresh
   * buffer rather than being lost (the 'start' event that originally
   * created the buffer has already been consumed above).
   */
  if (activeBuffering.has(feature)) {
    featureBuffers.set(feature, [])
  }
  return events
}

// ============================================================================
// PUB-SUB
// ============================================================================

/**
 * Emit a Mochi AI event to all registered listeners.
 * Called by the streaming handler in use-mochi-ai.ts when a tool
 * result includes `_event` metadata, or when content fence events
 * are detected in the stream.
 *
 * Content events (contract_content, contract_content_complete) are
 * also buffered for late-subscribing components.
 */
export function emitMochiEvent(event: MochiAIEvent): void {
  /** Log contract/ui-render events to trace the data flow */
  if (event.action.includes('contract_content') || event.action.includes('ui_spec_content')) {
    if (event.data?.type === 'start' || event.action.includes('complete')) {
      console.log(`[MochiEmitter] emitMochiEvent: ${event.feature}/${event.action}`, event.data?.type ?? '')
    }
  }
  /** Buffer content events for late subscribers (navigation timing) */
  bufferContentEvent(event)

  listeners.forEach((fn) => {
    try {
      fn(event)
    } catch (err) {
      console.warn('[MochiEvents] Listener error:', err)
    }
  })
}

/**
 * Subscribe to Mochi AI events.
 * @returns Unsubscribe function — call it in useEffect cleanup.
 */
export function subscribeMochiEvent(fn: MochiEventListener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
