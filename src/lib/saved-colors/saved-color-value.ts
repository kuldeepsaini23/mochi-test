/**
 * ============================================================================
 * SAVED COLOR VALUE — Parse/Serialize Complex Values in SavedColor.color Field
 * ============================================================================
 *
 * SOURCE OF TRUTH: SavedFillValue, ParsedSavedFill, SavedColorValue
 *
 * The SavedColor Prisma model stores a plain `color: String` field.
 * This module enables storing complex values (gradients, future: fonts, borders)
 * as JSON strings in that field, while keeping plain color strings (hex, rgba,
 * transparent) working as before.
 *
 * STORAGE FORMAT:
 * - Solid colors: stored as-is → "#ff0000", "rgba(0,0,0,0.5)", "transparent"
 * - Gradients: stored as JSON → '{"type":"gradient","gradient":{...GradientConfig}}'
 * - Future: same pattern → '{"type":"font","config":{...}}' etc.
 *
 * DETECTION: If the string starts with '{', try JSON.parse. Otherwise it's a
 * plain color string. This is fast and unambiguous since no valid CSS color
 * starts with '{'.
 *
 * SHARED: This file has NO 'server-only' directive — it's used by both
 * server services and client components.
 * ============================================================================
 */

import type { GradientConfig } from '@/components/website-builder/builder-v1.2/_lib/types'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Discriminated union for all possible saved fill values.
 * Extensible — add new variants here as new fill types are supported.
 */
export type SavedFillValue =
  | { type: 'solid'; color: string }
  | { type: 'gradient'; gradient: GradientConfig }

// ============================================================================
// PARSING — DB string → typed value
// ============================================================================

/**
 * Parse a raw color string from the database into a typed SavedFillValue.
 *
 * WHY: The DB stores everything as a plain string. This function detects
 * whether it's a simple color or a JSON-encoded complex value and returns
 * a typed discriminated union for safe handling in the UI.
 */
export function parseSavedColorValue(raw: string): SavedFillValue {
  /* JSON objects always start with '{' — no valid CSS color does */
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed.type === 'gradient' && parsed.gradient) {
        return { type: 'gradient', gradient: parsed.gradient as GradientConfig }
      }
    } catch {
      /* Not valid JSON — fall through to solid */
    }
  }
  return { type: 'solid', color: raw }
}

// ============================================================================
// SERIALIZATION — typed value → DB string
// ============================================================================

/**
 * Serialize a SavedFillValue to a string for database storage.
 *
 * Solid colors are stored as plain strings (no wrapper).
 * Complex values (gradients) are JSON-stringified with a type discriminator.
 */
export function serializeSavedFillValue(value: SavedFillValue): string {
  if (value.type === 'solid') return value.color
  return JSON.stringify({ type: 'gradient', gradient: value.gradient })
}

// ============================================================================
// QUICK CHECK — avoids full JSON.parse for filtering
// ============================================================================

/**
 * Quick check: is this raw saved color string a gradient value?
 *
 * WHY: Used to filter gradient entries out of the solid-only color picker
 * without the overhead of JSON.parse on every entry.
 */
export function isSavedGradient(raw: string): boolean {
  return raw.startsWith('{"type":"gradient"')
}
