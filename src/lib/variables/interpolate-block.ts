/**
 * Universal Block Interpolation Helper
 *
 * Recursively processes ALL text fields in any email block,
 * replacing {{variable}} placeholders with actual values.
 *
 * WHY: Instead of manually calling interpolateText() on each field,
 * this helper processes the entire block structure automatically.
 * New block types or fields are automatically supported.
 *
 * HOW: Deep clones the block and recursively walks all properties,
 * interpolating any string values found.
 *
 * USAGE:
 * const interpolatedBlock = interpolateBlock(block, variableContext)
 * // Now all text fields in interpolatedBlock have variables replaced
 *
 * SOURCE OF TRUTH KEYWORDS: InterpolateBlock, UniversalInterpolation, BlockInterpolator
 */

import { interpolate } from './interpolate'
import type { VariableContext } from './types'
import type { EmailBlock } from '@/types/email-templates'

/**
 * Recursively interpolate all string values in an object.
 *
 * @param value - Any value (string, array, object, etc.)
 * @param context - Variable context for interpolation
 * @returns The value with all strings interpolated
 */
function interpolateValue(value: unknown, context: VariableContext): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value
  }

  // Handle strings - this is where interpolation happens
  if (typeof value === 'string') {
    return interpolate(value, context)
  }

  // Handle arrays - recursively process each element
  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context))
  }

  // Handle objects - recursively process each property
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateValue(val, context)
    }
    return result
  }

  // Handle primitives (numbers, booleans) - return as-is
  return value
}

/**
 * Interpolate all text fields in an email block.
 *
 * This is the main export - use this to process a block before rendering.
 * Creates a deep clone with all strings interpolated.
 *
 * @param block - The email block to process
 * @param context - Variable context for interpolation
 * @returns A new block with all text fields interpolated
 *
 * @example
 * const block = { type: 'text', props: { text: 'Hello {{lead.firstName}}!' } }
 * const context = { lead: { firstName: 'John' } }
 * const result = interpolateBlock(block, context)
 * // result.props.text === 'Hello John!'
 */
export function interpolateBlock<T extends EmailBlock>(
  block: T,
  context: VariableContext
): T {
  return interpolateValue(block, context) as T
}

/**
 * Interpolate all blocks in an array.
 *
 * Convenience function for processing multiple blocks at once.
 *
 * @param blocks - Array of email blocks
 * @param context - Variable context for interpolation
 * @returns New array with all blocks interpolated
 */
export function interpolateBlocks(
  blocks: EmailBlock[],
  context: VariableContext
): EmailBlock[] {
  return blocks.map((block) => interpolateBlock(block, context))
}

/**
 * Interpolate a string if context is provided, otherwise return as-is.
 *
 * Helper for cases where you need to interpolate a single string
 * but context may be optional.
 *
 * @param text - Text to interpolate (or undefined)
 * @param context - Variable context (or null/undefined)
 * @returns Interpolated text or original text
 */
export function interpolateTextSafe(
  text: string | undefined,
  context: VariableContext | null | undefined
): string {
  if (!text) return ''
  if (!context) return text
  return interpolate(text, context)
}
