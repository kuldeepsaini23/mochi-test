/**
 * ============================================================================
 * INTERNAL TEMPLATE REGISTRY
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: InternalTemplateRegistry, getInternalTemplate,
 * listInternalTemplates
 *
 * WHY: Central lookup for all code-defined internal templates. New templates
 * are registered here by adding them to the REGISTRY map. The registry is
 * keyed by template ID for O(1) lookups during installation.
 *
 * HOW TO ADD A NEW TEMPLATE:
 * 1. Create a seed file in ./seeds/ (e.g., booking-starter.seed.ts)
 * 2. Import and add it to the REGISTRY map below
 */

import type { InternalTemplate } from './types'
import { ECOMMERCE_STARTER_TEMPLATE } from './seeds/ecommerce-starter.seed'

// ============================================================================
// REGISTRY — Map of template ID → InternalTemplate definition
// ============================================================================

/**
 * All registered internal templates, keyed by their unique ID.
 * Add new templates here as they are created.
 */
const REGISTRY = new Map<string, InternalTemplate>([
  [ECOMMERCE_STARTER_TEMPLATE.id, ECOMMERCE_STARTER_TEMPLATE],
])

// ============================================================================
// PUBLIC API — Lookup and listing functions
// ============================================================================

/**
 * Look up an internal template by its unique ID.
 * Returns null if no template with the given ID is registered.
 */
export function getInternalTemplate(id: string): InternalTemplate | null {
  return REGISTRY.get(id) ?? null
}

/**
 * Returns all registered internal templates as an array.
 * Useful for UI listing or iteration during bulk operations.
 */
export function listInternalTemplates(): InternalTemplate[] {
  return Array.from(REGISTRY.values())
}
