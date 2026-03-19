/**
 * ============================================================================
 * CMS ROW CONTEXT - Provides current CMS row data to child elements
 * ============================================================================
 *
 * SOURCE OF TRUTH: CMS Row Context for Dynamic Page Rendering
 *
 * When rendering elements inside a SmartCMS List or on a Dynamic Page,
 * child elements may need access to the current CMS row data.
 *
 * ============================================================================
 * USE CASES
 * ============================================================================
 *
 * 1. Link elements need row.id to build dynamic page URLs
 *    - SmartCMS List wraps each item in CmsRowProvider
 *    - Link element with linkType='dynamic' reads row.id from context
 *    - URL becomes: /domain/{targetPage.slug}/{row.id}
 *
 * 2. Button actions with type='dynamic-link' need row context
 *    - Same as Link elements but for buttons
 *
 * 3. Future: Direct CMS field bindings on any element
 *    - Text elements could bind content to CMS columns
 *    - Image elements could bind src to CMS columns
 *
 * ============================================================================
 * ARCHITECTURE
 * ============================================================================
 *
 * Provider Hierarchy:
 *
 * 1. SmartCMS List Item Rendering:
 *    <SmartCmsListRenderer>
 *      {rows.map(row => (
 *        <CmsRowProvider row={row} tableId={tableId}>
 *          <ComponentRenderer ... />
 *            <LinkElement /> <- reads row from context
 *        </CmsRowProvider>
 *      ))}
 *    </SmartCmsListRenderer>
 *
 * 2. Dynamic Page Rendering:
 *    <DynamicPageRenderer>
 *      <CmsRowProvider row={fetchedRow} tableId={page.cmsTableId}>
 *        <ResponsivePageRenderer elements={elements} />
 *      </CmsRowProvider>
 *    </DynamicPageRenderer>
 *
 * ============================================================================
 * NULL SAFETY
 * ============================================================================
 *
 * Context returns null when not inside a provider:
 * - In builder canvas (design mode): row is null, links show placeholder
 * - In preview without CMS context: row is null, links show '#'
 *
 * Use useCmsRowRequired() when you MUST have a row (throws if missing).
 */

'use client'

import React, { createContext, useContext, useMemo } from 'react'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * CMS Row data shape - matches what comes from cms.service.ts
 *
 * SOURCE OF TRUTH: This interface must match the row structure returned by
 * listRowsInfinite and getRowById from cms.service.ts
 */
export interface CmsRowData {
  /** Row ID (cuid) - unique identifier for this CMS record */
  id: string
  /** Column slug -> value mapping (JSON stored in database) */
  values: Record<string, unknown>
  /** Row order (used for cursor-based pagination) */
  order: number
}

/**
 * Context value type - what useCmsRowContext() returns
 */
interface CmsRowContextValue {
  /** Current CMS row data, null if not in a CMS context */
  row: CmsRowData | null
  /** The CMS table ID this row belongs to */
  tableId: string | null
  /**
   * Base path for dynamic URLs (e.g., '/webprodigies')
   * Used by Link elements to construct full URLs
   */
  basePath: string | null
}

// ============================================================================
// CONTEXT DEFINITION
// ============================================================================

/**
 * Default context value when not inside a provider.
 * All values are null - elements should handle this gracefully.
 */
const defaultContextValue: CmsRowContextValue = {
  row: null,
  tableId: null,
  basePath: null,
}

const CmsRowContext = createContext<CmsRowContextValue>(defaultContextValue)

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface CmsRowProviderProps {
  /** The CMS row data to provide to children */
  row: CmsRowData
  /** The CMS table ID this row belongs to */
  tableId: string
  /** Optional base path for URL construction (e.g., '/webprodigies') */
  basePath?: string
  /** Child elements that will have access to the row context */
  children: React.ReactNode
}

/**
 * Provider that wraps elements needing CMS row access.
 *
 * WHY: Provides the current CMS row to descendant elements without prop drilling.
 * This enables Link elements and Button actions to know which row they represent.
 *
 * USAGE:
 * ```tsx
 * <CmsRowProvider row={cmsRow} tableId="clx123abc" basePath="/webprodigies">
 *   <CardComponent />  // Can access row via useCmsRowContext()
 * </CmsRowProvider>
 * ```
 */
export function CmsRowProvider({
  row,
  tableId,
  basePath,
  children,
}: CmsRowProviderProps) {
  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo<CmsRowContextValue>(
    () => ({
      row,
      tableId,
      basePath: basePath ?? null,
    }),
    [row, tableId, basePath]
  )

  return (
    <CmsRowContext.Provider value={value}>{children}</CmsRowContext.Provider>
  )
}

// ============================================================================
// CONSUMER HOOKS
// ============================================================================

/**
 * Hook to access current CMS row context.
 *
 * Returns null values if not inside a CmsRowProvider.
 * Use this when CMS context is OPTIONAL (e.g., in design mode).
 *
 * EXAMPLE:
 * ```tsx
 * function LinkElement() {
 *   const { row, basePath } = useCmsRowContext()
 *
 *   // Handle case where we're not in a CMS context
 *   if (!row) {
 *     return <a href="#">{children}</a>
 *   }
 *
 *   // Build dynamic URL using row ID
 *   const href = `${basePath}/${targetSlug}/${row.id}`
 *   return <a href={href}>{children}</a>
 * }
 * ```
 */
export function useCmsRowContext(): CmsRowContextValue {
  return useContext(CmsRowContext)
}

/**
 * Hook that returns only the row, throwing if not in context.
 *
 * Use when you REQUIRE row data and being outside a provider is a bug.
 * This is useful inside SmartCMS List item renderers where row MUST exist.
 *
 * THROWS: Error if called outside a CmsRowProvider
 *
 * EXAMPLE:
 * ```tsx
 * function SmartCmsListItemRenderer() {
 *   // We know we're inside the list, so row MUST exist
 *   const row = useCmsRowRequired()
 *   return <div>{row.values.title}</div>
 * }
 * ```
 */
export function useCmsRowRequired(): CmsRowData {
  const { row } = useContext(CmsRowContext)
  if (!row) {
    throw new Error(
      'useCmsRowRequired must be used within a CmsRowProvider. ' +
        'This hook is intended for components that MUST have a CMS row (like SmartCMS List items).'
    )
  }
  return row
}

/**
 * Hook to get a specific column value from the current row.
 *
 * Returns undefined if not in context or if the column doesn't exist.
 * Useful for simple value access without destructuring the full row.
 *
 * EXAMPLE:
 * ```tsx
 * function ProductPrice() {
 *   const price = useCmsColumnValue<number>('price')
 *   if (price === undefined) return null
 *   return <span>${price.toFixed(2)}</span>
 * }
 * ```
 */
export function useCmsColumnValue<T = unknown>(
  columnSlug: string
): T | undefined {
  const { row } = useContext(CmsRowContext)
  if (!row) return undefined
  return row.values[columnSlug] as T | undefined
}
