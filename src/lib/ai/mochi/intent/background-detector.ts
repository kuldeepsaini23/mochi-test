/**
 * ============================================================================
 * BACKGROUND & REALTIME INTENT DETECTOR
 * ============================================================================
 *
 * Pure functions that detect whether a user's message signals they want
 * background execution (no navigation) or realtime execution (with navigation).
 *
 * Also handles option button clicks — the askUser tool presents
 * ["Real time", "Background"] buttons, and the clicked text is sent as
 * the user's message. These exact strings must be detected correctly.
 *
 * Examples of background intent:
 *   - "Create a contract for Acme Corp in the background"
 *   - "Don't navigate, just create the invoice"
 *   - "Background" (clicked button from askUser options)
 *
 * Examples of realtime intent:
 *   - "Real time" (clicked button from askUser options)
 *   - "Do it in real time"
 *   - "Open the builder"
 *
 * Zero dependencies, unit-testable.
 *
 * SOURCE OF TRUTH KEYWORDS: BackgroundIntentDetector, RealtimeIntentDetector, BackgroundMode
 * ============================================================================
 */

/**
 * Regex patterns that signal the user wants background execution.
 * Each pattern targets a distinct phrasing for "do this without navigating".
 * Includes exact-match for askUser button text "Background".
 */
const BACKGROUND_PATTERNS: RegExp[] = [
  /^background$/i,
  /\bin\s+the\s+background\b/i,
  /\bdon'?t\s+(navigate|redirect)\b/i,
  /\bstay\s+(on\s+this\s+page|here)\b/i,
  /\bsilently\b/i,
  /\bquietly\b/i,
  /\bwithout\s+(leaving|navigating|redirecting)\b/i,
  /\bbehind\s+the\s+scenes\b/i,
]

/**
 * Regex patterns that signal the user wants realtime execution (with navigation).
 * Includes exact-match for askUser button text "Real time".
 * Used to RESET backgroundMode when the user switches back to realtime.
 */
const REALTIME_PATTERNS: RegExp[] = [
  /^real\s*time$/i,
  /\bin\s+real\s*time\b/i,
  /\bopen\s+the\s+builder\b/i,
  /\bshow\s+me\s+(live|realtime|real-time)\b/i,
  /\bwatch\s+(it|the)\s+(generate|build)\b/i,
  /\brealtime\b/i,
  /\breal-time\b/i,
]

/**
 * Detects whether a user message contains intent to run in background mode.
 *
 * @param message - The raw user message text (or button click text)
 * @returns true if the message matches any background intent pattern
 *
 * @example
 * ```ts
 * detectBackgroundIntent("Create a contract in the background") // true
 * detectBackgroundIntent("Background")                          // true (button click)
 * detectBackgroundIntent("Create a contract for Acme Corp")     // false
 * detectBackgroundIntent("Don't navigate, just do it")          // true
 * ```
 */
export function detectBackgroundIntent(message: string): boolean {
  return BACKGROUND_PATTERNS.some((pattern) => pattern.test(message))
}

/**
 * Detects whether a user message contains intent to run in realtime mode.
 * Used to RESET backgroundMode when the user explicitly chooses realtime
 * after having previously activated background mode.
 *
 * @param message - The raw user message text (or button click text)
 * @returns true if the message matches any realtime intent pattern
 *
 * @example
 * ```ts
 * detectRealtimeIntent("Real time")                    // true (button click)
 * detectRealtimeIntent("Do it in real time")           // true
 * detectRealtimeIntent("Open the builder and show me") // true
 * detectRealtimeIntent("Create a contract")            // false
 * ```
 */
export function detectRealtimeIntent(message: string): boolean {
  return REALTIME_PATTERNS.some((pattern) => pattern.test(message))
}
