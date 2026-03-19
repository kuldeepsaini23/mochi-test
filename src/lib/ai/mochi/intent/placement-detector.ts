/**
 * ============================================================================
 * PLACEMENT DIRECTIVE DETECTOR
 * ============================================================================
 *
 * Pure function that detects whether a user's message contains explicit
 * intent to place AI-generated content directly on the page canvas
 * (above/below their selection) vs. the default staging behavior.
 *
 * By default, AI-generated content goes to the staging panel where
 * the user can preview and drag-and-drop it onto the page canvas.
 * Only when the user explicitly requests positional placement
 * (e.g., "add above my selection", "insert below the hero") does
 * the content bypass staging and land directly on the page canvas.
 *
 * Zero dependencies, unit-testable. Follows the same pattern as
 * background-detector.ts.
 *
 * SOURCE OF TRUTH KEYWORDS: PlacementDetector, PlacementDirective,
 * DirectInsertDetector, StagingModeDetector
 * ============================================================================
 */

/**
 * Discriminated union for the AI content placement mode.
 *
 * - `stage`: Default — AI content goes to staging panel for drag-and-drop
 * - `direct`: Explicit — AI content inserts directly onto the page canvas
 *   relative to the user's selection (above/below)
 * - `canvas-floating`: AI content becomes a real interactive floating element
 *   on the canvas (parentId: null) that the user can immediately select, move,
 *   and resize — like any manually-placed element. Used on the website builder
 *   as the default mode so AI-generated content is fully interactive.
 *
 * SOURCE OF TRUTH KEYWORDS: PlacementDirective, AIPlacementMode, CanvasFloatingMode
 */
export type PlacementDirective =
  | { mode: 'stage' }
  | { mode: 'direct' }
  | { mode: 'canvas-floating' }

/**
 * Regex patterns that signal the user wants DIRECT canvas placement.
 * Each pattern targets a distinct phrasing for "place this relative
 * to my selection / directly on the page".
 *
 * These are intentionally strict — we only bypass staging when the
 * user is unambiguously asking for positional placement.
 */
const DIRECT_PLACEMENT_PATTERNS: RegExp[] = [
  /* "add/insert/put/place above/below/before/after my selection" */
  /\b(add|insert|put|place|create)\b.{0,30}\b(above|below|before|after)\b.{0,20}\b(my\s+)?(selection|selected|element|section|component|block)\b/i,

  /* "above/below the hero / the header / this section" */
  /\b(above|below|before|after)\b.{0,15}\b(the|this|my)\s+\w+/i,

  /* "add it directly to the page" / "insert directly" / "place directly" */
  /\b(add|insert|put|place|create)\b.{0,10}\b(it\s+)?directly\b/i,

  /* "insert above" / "add below" (short form — verb + direction at end) */
  /\b(add|insert|put|place|create)\b.{0,40}\b(above|below)\s*(it|that|this)?\s*$/i,

  /* "right above" / "right below" — emphasizing exact position */
  /\bright\s+(above|below)\b/i,

  /* "on top of" / "underneath" — positional language */
  /\b(on\s+top\s+of|underneath)\b/i,
]

/**
 * Detects whether a user message contains explicit intent for direct
 * canvas placement (bypass staging).
 *
 * @param message - The raw user message text
 * @returns PlacementDirective with mode 'direct' if explicit placement
 *          language is detected, otherwise 'stage' (default)
 *
 * @example
 * ```ts
 * detectPlacementDirective("Create a hero section")
 * // → { mode: 'stage' }
 *
 * detectPlacementDirective("Add a CTA section below my selection")
 * // → { mode: 'direct' }
 *
 * detectPlacementDirective("Insert directly above the hero")
 * // → { mode: 'direct' }
 *
 * detectPlacementDirective("Create a pricing table")
 * // → { mode: 'stage' }
 * ```
 */
export function detectPlacementDirective(message: string): PlacementDirective {
  const isDirect = DIRECT_PLACEMENT_PATTERNS.some((pattern) => pattern.test(message))
  return isDirect ? { mode: 'direct' } : { mode: 'stage' }
}
