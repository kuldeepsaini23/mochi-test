/**
 * Notification Category Sound Map
 *
 * SOURCE OF TRUTH KEYWORDS: CategorySoundMap, NotificationSound,
 *   NotificationCategorySound, getCategorySound
 *
 * WHY: Maps each notification category to an optional sound file path.
 * When a realtime notification arrives, the UI plays the associated sound
 * (if one exists) alongside the toast. This gives users an audible cue
 * for high-value events like payments without being noisy for every category.
 *
 * HOW: Uses a Partial<Record> keyed by NotificationCategory so only categories
 * with an assigned sound are listed. Adding a new sound is a single line change.
 *
 * USAGE: Called from use-notification-realtime.ts after showing the toast.
 */

import type { NotificationCategory } from './types'

// ============================================================================
// CATEGORY -> SOUND FILE MAP
// ============================================================================

/**
 * Maps notification categories to their sound file paths (relative to /public).
 *
 * Only categories with a sound need to be listed here. Categories not in
 * this map will return null from getCategorySound(), meaning no sound plays.
 *
 * To add a new sound:
 * 1. Drop the audio file into /public (or /public/sounds for organization)
 * 2. Add the category entry below with the path starting from /
 */
const CATEGORY_SOUND_MAP: Partial<Record<NotificationCategory, string>> = {
  payment: '/chaching.mp3',
  // Add more sounds here as needed:
  // inbox: '/sounds/message.mp3',
  // lead: '/sounds/new-lead.mp3',
  // appointment: '/sounds/appointment.mp3',
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Returns the sound file URL for a notification category, or null if
 * no sound is configured for that category.
 *
 * @param category - The notification category string from the realtime event
 * @returns The sound file path (e.g. '/chaching.mp3') or null
 */
export function getCategorySound(category: string): string | null {
  return CATEGORY_SOUND_MAP[category as NotificationCategory] ?? null
}
