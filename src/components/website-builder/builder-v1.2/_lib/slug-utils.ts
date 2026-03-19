/**
 * ============================================================================
 * SLUG UTILITIES - Pathname Sanitization & Validation
 * ============================================================================
 *
 * Single source of truth for URL slug/pathname handling.
 * Used by:
 * - Builder header (when editing page pathname)
 * - Website creation dialog (when setting initial page slug)
 * - Any other place that needs to handle URL paths
 *
 * ============================================================================
 * SLUG RULES
 * ============================================================================
 *
 * Valid slugs:
 * - Start with a single forward slash: /home, /about-us
 * - Only contain lowercase letters, numbers, and hyphens
 * - No spaces, special characters, or consecutive slashes
 * - No trailing slashes (except for root /)
 *
 * Examples:
 * - "  //Home Page  " → "/home-page"
 * - "About Us!!!" → "/about-us"
 * - "///weird///path///" → "/weird-path"
 * - "contact_us" → "/contact-us"
 *
 * ============================================================================
 */

import { z } from 'zod'

// ============================================================================
// SLUG SANITIZER
// ============================================================================

/**
 * Sanitizes user input into a valid URL path segment (no leading slash).
 *
 * TRANSFORMATIONS:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Replace spaces and underscores with hyphens
 * 4. Remove all characters except letters, numbers, and hyphens
 * 5. Collapse multiple hyphens into one
 * 6. Remove leading/trailing hyphens
 * 7. Limit to 63 characters (URL segment limit)
 *
 * @param input - Raw user input (can be messy)
 * @returns Clean, valid URL segment WITHOUT leading slash
 *
 * @example
 * sanitizeSlugSegment("  Home Page  ") // → "home-page"
 * sanitizeSlugSegment("About Us!!!") // → "about-us"
 * sanitizeSlugSegment("contact_us") // → "contact-us"
 * sanitizeSlugSegment("///weird///") // → "weird"
 * sanitizeSlugSegment("") // → "untitled"
 */
export function sanitizeSlugSegment(input: string): string {
  let slug = input
    // Step 1: Trim whitespace
    .trim()
    // Step 2: Convert to lowercase
    .toLowerCase()
    // Step 3: Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Step 4: Remove invalid characters (keep only letters, numbers, hyphens)
    .replace(/[^a-z0-9-]/g, '')
    // Step 5: Collapse multiple hyphens into one
    .replace(/-+/g, '-')
    // Step 6: Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Step 7: Limit to 63 characters
    .slice(0, 63)

  // If empty after sanitization, use default
  if (!slug) {
    return 'untitled'
  }

  return slug
}

/**
 * Sanitizes user input into a valid URL slug WITH leading slash.
 *
 * IMPORTANT: A slug is a SINGLE path segment, not nested paths.
 * All slashes in user input are converted to hyphens.
 *
 * TRANSFORMATIONS:
 * 1. Trim whitespace
 * 2. Convert to lowercase
 * 3. Replace slashes, spaces, and underscores with hyphens
 * 4. Remove all invalid characters (keep only letters, numbers, hyphens)
 * 5. Collapse multiple hyphens into one
 * 6. Remove leading/trailing hyphens
 * 7. Add single leading slash
 * 8. Limit to 63 characters (URL segment limit)
 *
 * @param input - Raw user input (can be messy)
 * @returns Clean, valid URL slug starting with /
 *
 * @example
 * sanitizeSlug("  //Home Page  ") // → "/home-page"
 * sanitizeSlug("About Us!!!") // → "/about-us"
 * sanitizeSlug("///weird///path///") // → "/weird-path"
 * sanitizeSlug("/dsa/das/das /as/d") // → "/dsa-das-das-as-d"
 * sanitizeSlug("contact_us") // → "/contact-us"
 * sanitizeSlug("") // → "/untitled"
 */
export function sanitizeSlug(input: string): string {
  let slug = input
    // Step 1: Trim whitespace
    .trim()
    // Step 2: Convert to lowercase
    .toLowerCase()
    // Step 3: Replace slashes, spaces, and underscores with hyphens
    // (slashes should NOT create nested paths - they become hyphens)
    .replace(/[/\s_]+/g, '-')
    // Step 4: Remove all invalid characters (keep only letters, numbers, hyphens)
    .replace(/[^a-z0-9-]/g, '')
    // Step 5: Collapse multiple hyphens into one
    .replace(/-+/g, '-')
    // Step 6: Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Step 7: Limit to 63 characters
    .slice(0, 63)

  // Step 8: If empty after sanitization, use default
  if (!slug) {
    return '/untitled'
  }

  // Step 9: Add leading slash
  return `/${slug}`
}

// ============================================================================
// ZOD SCHEMA FOR VALIDATION
// ============================================================================

/**
 * Zod schema for validating slugs AFTER sanitization.
 *
 * This validates the final slug format, not raw user input.
 * Use sanitizeSlug() first, then validate with this schema.
 *
 * VALIDATION RULES:
 * - Must start with /
 * - Must be at least 2 characters (/ + something)
 * - Only lowercase letters, numbers, hyphens, and single slashes
 * - No consecutive slashes or hyphens
 * - No trailing slash
 */
export const slugSchema = z
  .string()
  .min(2, 'Pathname must have at least one character after /')
  .max(100, 'Pathname is too long (max 100 characters)')
  .regex(/^\//, 'Pathname must start with /')
  .regex(
    /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/,
    'Pathname can only contain lowercase letters, numbers, and hyphens'
  )

/**
 * Validates a slug and returns a result object.
 *
 * @param slug - The slug to validate (should be sanitized first)
 * @returns Object with success status and error message if invalid
 *
 * @example
 * const result = validateSlug("/home-page")
 * if (!result.success) {
 *   showError(result.error)
 * }
 */
export function validateSlug(slug: string): { success: boolean; error?: string } {
  const result = slugSchema.safeParse(slug)

  if (result.success) {
    return { success: true }
  }

  // Return the first error message (ZodError uses 'issues' not 'errors')
  return {
    success: false,
    error: result.error.issues[0]?.message || 'Invalid pathname',
  }
}

// ============================================================================
// COMBINED HELPER - Sanitize & Validate
// ============================================================================

/**
 * Sanitizes user input and validates the result.
 *
 * This is the main function to use when processing user input.
 * It handles all the messy input and returns a clean, valid slug.
 *
 * @param input - Raw user input
 * @returns Object with sanitized slug and validation result
 *
 * @example
 * const { slug, isValid, error } = processSlugInput("  My Page!!!  ")
 * // slug: "/my-page"
 * // isValid: true
 * // error: undefined
 */
export function processSlugInput(input: string): {
  slug: string
  isValid: boolean
  error?: string
} {
  const slug = sanitizeSlug(input)
  const validation = validateSlug(slug)

  return {
    slug,
    isValid: validation.success,
    error: validation.error,
  }
}
