/**
 * ============================================================================
 * MOCHI AI EVENTS - BARREL EXPORTS
 * ============================================================================
 *
 * Re-exports the event system for clean imports:
 *   import { emitMochiEvent, useMochiEvents } from '@/lib/ai/mochi/events'
 *   import type { MochiAIEvent } from '@/lib/ai/mochi/events'
 *
 * SOURCE OF TRUTH KEYWORDS: MochiEventsExports
 * ============================================================================
 */

export type { MochiAIEvent, MochiEventFeature, MochiEventAction } from './types'
export { emitMochiEvent, subscribeMochiEvent, consumeFeatureBuffer } from './emitter'
export { useMochiEvents } from './use-mochi-events'
