'use client'

import { createContext, useContext } from 'react'

/**
 * ============================================================================
 * PARENT FLEX DIRECTION CONTEXT
 * ============================================================================
 *
 * Carries the parent frame's CSS flex-direction value down to child elements.
 * Children use this to determine the correct CSS for autoWidth behavior:
 *
 * - Parent is 'row' or 'row-reverse': autoWidth -> flex: 1 1 0% + minWidth: 0
 *   (share horizontal space equally among siblings)
 * - Parent is 'column' or 'column-reverse': autoWidth -> width: 100%
 *   (fill the full cross-axis width — current/default behavior)
 *
 * UnifiedFrame and UnifiedLink provide this context to their children.
 * useElementSizeStyles() reads it automatically.
 *
 * SOURCE OF TRUTH: ParentFlexDirectionContext, parent-layout-context
 */
const ParentFlexDirectionContext = createContext<string>('column')

/** Provider component for parent flex direction */
export const ParentFlexDirectionProvider = ParentFlexDirectionContext.Provider

/**
 * Returns the parent frame's flex-direction CSS value.
 * Defaults to 'column' when no parent frame provides context.
 */
export function useParentFlexDirection(): string {
  return useContext(ParentFlexDirectionContext)
}

/**
 * ============================================================================
 * PARENT SMART GRID CONTEXT
 * ============================================================================
 *
 * Carries whether the parent frame uses responsive smart grid layout.
 * Children use this to adjust their sizing behavior:
 *
 * - Parent is smart grid: autoWidth -> width: 100% (fill the grid cell)
 *   No flex: 1 1 0% because CSS Grid handles column sizing via minmax().
 * - Parent is NOT smart grid: normal flex behavior applies
 *
 * SOURCE OF TRUTH: ParentSmartGridContext, smart-grid-layout
 */
const ParentSmartGridContext = createContext<boolean>(false)

/** Provider component for parent smart grid state */
export const ParentSmartGridProvider = ParentSmartGridContext.Provider

/**
 * Returns whether the parent frame uses responsive smart grid layout.
 * Defaults to false when no parent provides context.
 */
export function useParentSmartGrid(): boolean {
  return useContext(ParentSmartGridContext)
}
