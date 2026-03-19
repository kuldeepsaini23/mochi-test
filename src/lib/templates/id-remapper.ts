/**
 * ============================================================================
 * TEMPLATE SYSTEM — ID REMAPPER
 * ============================================================================
 *
 * SOURCE OF TRUTH KEYWORDS: IdRemapper, RemapIds, TopologicalSort,
 * TemplateIdRemap, CrossFeatureRemap
 *
 * WHY: When a template is installed, each feature gets new database IDs.
 * But features reference each other by ID (e.g., an automation's trigger
 * references a form ID, a page's canvas references a CMS table ID).
 * The remapper walks all JSON data and replaces old IDs with new ones.
 *
 * HOW:
 * - topologicalSort: Orders template items so dependencies install first.
 * - remapIds: Deep-walks a JSON structure, replacing any value found
 *   in the remap table with its new counterpart.
 */

import type { IdRemapTable } from './types'

// ============================================================================
// TOPOLOGICAL SORT — Orders items by dependency graph
// ============================================================================

/**
 * Topologically sorts template items so that dependencies are installed before
 * dependents. Items with no dependencies come first.
 *
 * Uses Kahn's algorithm (BFS-based) for deterministic ordering.
 * Falls back to original order for items at the same dependency depth.
 *
 * @param items - Array of items with id, dependsOn, and order fields
 * @returns Sorted array in installation order
 * @throws Error if a dependency cycle is detected (should never happen with valid data)
 */
export function topologicalSort<
  T extends { id: string; dependsOn: string[]; order: number }
>(items: T[]): T[] {
  /** Map of item ID to item for quick lookup */
  const itemMap = new Map<string, T>()
  /** Map of item ID to incoming dependency count */
  const inDegree = new Map<string, number>()
  /** Map of item ID to list of items that depend on it */
  const dependents = new Map<string, string[]>()

  /** Initialize graph structures */
  for (const item of items) {
    itemMap.set(item.id, item)
    inDegree.set(item.id, 0)
    dependents.set(item.id, [])
  }

  /** Build the dependency graph edges */
  for (const item of items) {
    for (const depId of item.dependsOn) {
      /** Only count edges for items that are in our set */
      if (itemMap.has(depId)) {
        inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1)
        const depList = dependents.get(depId) ?? []
        depList.push(item.id)
        dependents.set(depId, depList)
      }
    }
  }

  /** Seed the queue with all items that have no dependencies */
  const queue: T[] = []
  for (const item of items) {
    if ((inDegree.get(item.id) ?? 0) === 0) {
      queue.push(item)
    }
  }

  /** Sort initial queue by order field for deterministic output */
  queue.sort((a, b) => a.order - b.order)

  /** BFS — process items in dependency order */
  const result: T[] = []
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue

    visited.add(current.id)
    result.push(current)

    /** Reduce in-degree for all dependents */
    const deps = dependents.get(current.id) ?? []
    const newlyReady: T[] = []

    for (const depId of deps) {
      const newDegree = (inDegree.get(depId) ?? 1) - 1
      inDegree.set(depId, newDegree)

      if (newDegree === 0 && !visited.has(depId)) {
        const depItem = itemMap.get(depId)
        if (depItem) newlyReady.push(depItem)
      }
    }

    /** Sort newly ready items by order for deterministic output */
    newlyReady.sort((a, b) => a.order - b.order)
    queue.push(...newlyReady)
  }

  /** Cycle detection — if not all items were visited, there's a cycle */
  if (result.length !== items.length) {
    const missing = items.filter((i) => !visited.has(i.id)).map((i) => i.id)
    throw new Error(
      `Dependency cycle detected in template items: ${missing.join(', ')}`
    )
  }

  return result
}

// ============================================================================
// ID REMAPPING — Deep-walks JSON and replaces old IDs with new ones
// ============================================================================

/**
 * Deep-walks a JSON-serializable data structure and replaces any string value
 * that appears as a key in the remap table with its corresponding new value.
 *
 * Works on:
 * - canvasData element references (form IDs, CMS table IDs, component IDs)
 * - Automation schema node references (email template IDs, form IDs)
 * - Trigger config references (formId, productId, pipelineId)
 * - Any nested JSON structure with cross-feature ID references
 *
 * @param data - The JSON data to remap (not mutated — returns a new copy)
 * @param remapTable - Mapping of { oldId → newId }
 * @returns A deep copy with all matched IDs replaced
 */
export function remapIds<T>(data: T, remapTable: IdRemapTable): T {
  /** Empty remap table — return data as-is (no copy needed for perf) */
  if (Object.keys(remapTable).length === 0) return data

  return remapValue(data, remapTable) as T
}

/**
 * Keys whose values should NEVER be remapped.
 *
 * WHY: Slug remapping adds entries like "checkout" → "checkout-k7x2m" to the
 * remap table. Without this protection, element.type === "checkout" would also
 * be remapped, corrupting the element type and breaking rendering.
 *
 * SOURCE OF TRUTH: RemapProtectedKeys, IdRemapSkipKeys
 */
const PROTECTED_KEYS = new Set(['type'])

/**
 * Recursive helper that handles all JSON value types.
 * Replaces string values found in the remap table.
 * Accepts an optional `parentKey` to skip remapping on protected keys
 * (e.g., element.type should never be remapped even if the value matches).
 */
function remapValue(value: unknown, table: IdRemapTable, parentKey?: string): unknown {
  /** Null/undefined pass through */
  if (value === null || value === undefined) return value

  /** Strings — check if this string is a key in the remap table */
  if (typeof value === 'string') {
    /** Skip remapping for protected keys (e.g., element "type" field) */
    if (parentKey && PROTECTED_KEYS.has(parentKey)) return value
    return table[value] ?? value
  }

  /** Primitives (number, boolean) pass through */
  if (typeof value !== 'object') return value

  /** Arrays — remap each element */
  if (Array.isArray(value)) {
    return value.map((item) => remapValue(item, table))
  }

  /** Objects — remap each value (keys are preserved, parentKey passed for protection) */
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    result[key] = remapValue(val, table, key)
  }
  return result
}
